import { pool } from '../config/db.js';
import { generateId, ID_PREFIXES } from '../utils/idGenerator.js';
import { obtenerPermisosActivos, crearPermisos, PERMISOS } from '../utils/permissions.js';
import { registrarEvento, TIPOS_EVENTO, PRIORIDADES } from '../utils/eventos.js';

/**
 * GET /api/roles
 * Obtiene todos los roles
 */
export async function getRoles(req, res) {
    try {
        const { es_activo } = req.query;

        let query = `
            SELECT
                r.id,
                r.nombre,
                r.descripcion,
                r.posicion,
                r.permisos_bitwise,
                r.es_admin,
                r.es_empleado,
                r.es_activo,
                r.fecha_registro,
                r.tolerancia_id,
                r.color,
                t.nombre as tolerancia_nombre,
                (SELECT COUNT(*) FROM usuarios_roles ur WHERE ur.rol_id = r.id AND ur.es_activo = true) as usuarios_count
            FROM roles r
            LEFT JOIN tolerancias t ON t.id = r.tolerancia_id
        `;

        const params = [req.empresa_id];
        let paramIndex = 2;
        if (es_activo !== undefined && es_activo !== 'all') {
            query += ` WHERE r.empresa_id = $1 AND r.es_activo = $${paramIndex++}`;
            params.push(es_activo === 'true');
        } else {
            query += ` WHERE r.empresa_id = $1`;
            if (es_activo !== 'all') {
                query += ` AND r.es_activo = true`;
            }
        }

        query += ` ORDER BY r.posicion ASC`;

        const resultado = await pool.query(query, params);

        // Agregar lista de permisos activos a cada rol
        const roles = resultado.rows.map(rol => ({
            ...rol,
            permisos_lista: obtenerPermisosActivos(rol.permisos_bitwise)
        }));

        res.json({
            success: true,
            data: roles
        });

    } catch (error) {
        console.error('Error en getRoles:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener roles'
        });
    }
}

/**
 * GET /api/roles/:id
 * Obtiene un rol por ID con sus permisos detallados
 */
export async function getRolById(req, res) {
    try {
        const { id } = req.params;

        const resultado = await pool.query(`
            SELECT
                r.id,
                r.nombre,
                r.descripcion,
                r.posicion,
                r.permisos_bitwise,
                r.es_admin,
                r.es_empleado,
                r.fecha_registro,
                r.tolerancia_id,
                r.color,
                t.nombre as tolerancia_nombre
            FROM roles r
            LEFT JOIN tolerancias t ON t.id = r.tolerancia_id
            WHERE r.id = $1 AND r.empresa_id = $2
        `, [id, req.empresa_id]);

        if (resultado.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Rol no encontrado'
            });
        }

        const rol = resultado.rows[0];

        // Obtener usuarios con este rol
        const usuariosResult = await pool.query(`
            SELECT u.id, u.usuario, u.nombre, u.correo
            FROM usuarios u
            INNER JOIN usuarios_roles ur ON ur.usuario_id = u.id
            WHERE ur.rol_id = $1 AND ur.es_activo = true AND u.estado_cuenta = 'activo'
        `, [id]);

        res.json({
            success: true,
            data: {
                ...rol,
                permisos_lista: obtenerPermisosActivos(rol.permisos_bitwise),
                usuarios: usuariosResult.rows
            }
        });

    } catch (error) {
        console.error('Error en getRolById:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener rol'
        });
    }
}

/**
 * POST /api/roles
 * Crea un nuevo rol
 */
export async function createRol(req, res) {
    try {
        const {
            nombre,
            descripcion,
            posicion = 1,
            permisos = [],  // Array de códigos: ['USUARIO_VER', 'ROL_VER']
            es_admin = false,
            es_empleado = false,
            tolerancia_id,
            color
        } = req.body;

        if (!nombre) {
            return res.status(400).json({
                success: false,
                message: 'El nombre del rol es requerido'
            });
        }

        // Convertir array de permisos a bitwise
        const bitPositions = permisos.map(p => PERMISOS[p]).filter(p => p !== undefined);
        const permisos_bitwise = crearPermisos(bitPositions);

        const id = await generateId(ID_PREFIXES.ROL);

        const resultado = await pool.query(`
            INSERT INTO roles (id, nombre, descripcion, posicion, permisos_bitwise, es_admin, es_empleado, tolerancia_id, color, empresa_id)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            RETURNING *
        `, [id, nombre, descripcion, posicion, permisos_bitwise.toString(), es_admin, es_empleado, tolerancia_id, color, req.empresa_id]);

        // Registrar evento
        await registrarEvento({
            titulo: 'Rol creado',
            descripcion: `Se creó el rol "${nombre}"`,
            tipo_evento: TIPOS_EVENTO.ROL,
            prioridad: PRIORIDADES.MEDIA,
            usuario_modificador_id: req.usuario?.id,
            detalles: { rol_id: id, nombre, permisos }
        });

        res.status(201).json({
            success: true,
            message: 'Rol creado correctamente',
            data: {
                ...resultado.rows[0],
                permisos_lista: obtenerPermisosActivos(permisos_bitwise)
            }
        });

    } catch (error) {
        console.error('Error en createRol:', error);
        res.status(500).json({
            success: false,
            message: 'Error al crear rol'
        });
    }
}

/**
 * PUT /api/roles/:id
 * Actualiza un rol existente
 */
export async function updateRol(req, res) {
    const client = await pool.connect();

    try {
        const { id } = req.params;
        const {
            nombre,
            descripcion,
            posicion,
            permisos,  // Array de códigos o null para no cambiar
            es_admin,
            es_empleado,
            tolerancia_id,
            color
        } = req.body;

        // Obtener rol actual para auditoría
        const rolActual = await client.query('SELECT * FROM roles WHERE id = $1 AND empresa_id = $2', [id, req.empresa_id]);
        if (rolActual.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Rol no encontrado'
            });
        }

        await client.query('BEGIN');

        let permisos_bitwise = rolActual.rows[0].permisos_bitwise;

        // Si se enviaron permisos, recalcular
        if (permisos !== undefined && Array.isArray(permisos)) {
            const bitPositions = permisos.map(p => PERMISOS[p]).filter(p => p !== undefined);
            permisos_bitwise = crearPermisos(bitPositions).toString();

            // Registrar auditoría de cambio de permisos
            const audId = await generateId(ID_PREFIXES.AUDITORIA);
            await client.query(`
                INSERT INTO permisos_auditoria (id, rol_id, permisos_anteriores, permisos_nuevos, usuario_modificador_id, cambios_detalle)
                VALUES ($1, $2, $3, $4, $5, $6)
            `, [
                audId,
                id,
                rolActual.rows[0].permisos_bitwise,
                permisos_bitwise,
                req.usuario.id,
                JSON.stringify({
                    permisos_anteriores: obtenerPermisosActivos(rolActual.rows[0].permisos_bitwise),
                    permisos_nuevos: permisos
                })
            ]);
        }

        const resultado = await client.query(`
            UPDATE roles SET
                nombre = COALESCE($1, nombre),
                descripcion = COALESCE($2, descripcion),
                posicion = COALESCE($3, posicion),
                permisos_bitwise = $4,
                es_admin = COALESCE($5, es_admin),
                es_empleado = COALESCE($6, es_empleado),
                tolerancia_id = COALESCE($7, tolerancia_id),
                color = COALESCE($8, color)
            WHERE id = $9 AND empresa_id = $10
            RETURNING *
        `, [nombre, descripcion, posicion, permisos_bitwise, es_admin, es_empleado, tolerancia_id, color, id, req.empresa_id]);

        await client.query('COMMIT');

        // Registrar evento
        await registrarEvento({
            titulo: 'Rol actualizado',
            descripcion: `Se actualizó el rol "${resultado.rows[0].nombre}"`,
            tipo_evento: TIPOS_EVENTO.ROL,
            prioridad: PRIORIDADES.MEDIA,
            usuario_modificador_id: req.usuario?.id,
            detalles: { rol_id: id, cambios: req.body }
        });

        res.json({
            success: true,
            message: 'Rol actualizado correctamente',
            data: {
                ...resultado.rows[0],
                permisos_lista: obtenerPermisosActivos(resultado.rows[0].permisos_bitwise)
            }
        });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error en updateRol:', error);
        res.status(500).json({
            success: false,
            message: 'Error al actualizar rol'
        });
    } finally {
        client.release();
    }
}

/**
 * DELETE /api/roles/:id
 * Desactiva un rol (soft delete)
 */
export async function deleteRol(req, res) {
    try {
        const { id } = req.params;

        const resultado = await pool.query(`
            UPDATE roles SET es_activo = false WHERE id = $1 AND empresa_id = $2 RETURNING id, nombre
        `, [id, req.empresa_id]);

        if (resultado.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Rol no encontrado'
            });
        }

        // Desactivar asignaciones de usuarios a este rol
        await pool.query(
            'UPDATE usuarios_roles SET es_activo = false WHERE rol_id = $1',
            [id]
        );

        // Registrar evento
        await registrarEvento({
            titulo: 'Rol desactivado',
            descripcion: `Se desactivó el rol "${resultado.rows[0].nombre}"`,
            tipo_evento: TIPOS_EVENTO.ROL,
            prioridad: PRIORIDADES.ALTA,
            usuario_modificador_id: req.usuario?.id,
            detalles: { rol_id: id }
        });

        res.json({
            success: true,
            message: 'Rol desactivado correctamente'
        });

    } catch (error) {
        console.error('Error en deleteRol:', error);
        res.status(500).json({
            success: false,
            message: 'Error al desactivar rol'
        });
    }
}

/**
 * PATCH /api/roles/:id/reactivar
 * Reactiva un rol desactivado
 */
export async function reactivarRol(req, res) {
    try {
        const { id } = req.params;

        const resultado = await pool.query(`
            UPDATE roles SET es_activo = true
            WHERE id = $1 AND es_activo = false AND empresa_id = $2
            RETURNING id, nombre
        `, [id, req.empresa_id]);

        if (resultado.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Rol no encontrado o ya está activo'
            });
        }

        await registrarEvento({
            titulo: 'Rol reactivado',
            descripcion: `Se reactivó el rol "${resultado.rows[0].nombre}"`,
            tipo_evento: TIPOS_EVENTO.ROL,
            prioridad: PRIORIDADES.ALTA,
            usuario_modificador_id: req.usuario?.id,
            detalles: { rol_id: id }
        });

        // Reactivar asignaciones de usuarios a este rol
        // Nota: Esto reactivará a todos los usuarios que tenían este rol.
        // Si se desea algo más selectivo en el futuro, se requeriría una lógica más compleja de historial.
        await pool.query(
            'UPDATE usuarios_roles SET es_activo = true WHERE rol_id = $1',
            [id]
        );

        res.json({
            success: true,
            message: 'Rol y asignaciones reactivados correctamente'
        });

    } catch (error) {
        console.error('Error en reactivarRol:', error);
        res.status(500).json({
            success: false,
            message: 'Error al reactivar rol'
        });
    }
}

/**
 * GET /api/roles/permisos/catalogo
 * Obtiene el catálogo de permisos disponibles
 */
export async function getPermisosCatalogo(req, res) {
    try {
        const resultado = await pool.query(`
            SELECT
                id,
                codigo,
                nombre,
                descripcion,
                bit_position,
                categoria,
                modulo_id
            FROM permisos_catalogo
            WHERE es_activo = true
            ORDER BY bit_position ASC
        `);

        // Agrupar por categoría
        const porCategoria = {};
        for (const permiso of resultado.rows) {
            if (!porCategoria[permiso.categoria]) {
                porCategoria[permiso.categoria] = [];
            }
            porCategoria[permiso.categoria].push(permiso);
        }

        res.json({
            success: true,
            data: {
                lista: resultado.rows,
                por_categoria: porCategoria
            }
        });

    } catch (error) {
        console.error('Error en getPermisosCatalogo:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener catálogo de permisos'
        });
    }
}

/**
 * GET /api/roles/:id/usuarios
 * Obtiene los usuarios que tienen un rol específico
 */
export async function getUsuariosConRol(req, res) {
    try {
        const { id } = req.params;

        const resultado = await pool.query(`
            SELECT
                u.id,
                u.usuario,
                u.nombre,
                u.correo,
                u.foto,
                u.estado_cuenta,
                ur.fecha_registro as fecha_asignacion
            FROM usuarios u
            INNER JOIN usuarios_roles ur ON ur.usuario_id = u.id
            WHERE ur.rol_id = $1 AND ur.es_activo = true AND u.empresa_id = $2
            ORDER BY u.nombre ASC
        `, [id, req.empresa_id]);

        res.json({
            success: true,
            data: resultado.rows
        });

    } catch (error) {
        console.error('Error en getUsuariosConRol:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener usuarios del rol'
        });
    }
}
