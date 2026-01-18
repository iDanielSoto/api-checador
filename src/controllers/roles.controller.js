import { pool } from '../config/db.js';
import { generateId, ID_PREFIXES } from '../utils/idGenerator.js';
import { obtenerPermisosActivos, crearPermisos, PERMISOS } from '../utils/permissions.js';

/**
 * GET /api/roles
 * Obtiene todos los roles
 */
export async function getRoles(req, res) {
    try {
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
                t.nombre as tolerancia_nombre,
                (SELECT COUNT(*) FROM usuarios_roles ur WHERE ur.rol_id = r.id AND ur.es_activo = true) as usuarios_count
            FROM roles r
            LEFT JOIN tolerancias t ON t.id = r.tolerancia_id
            ORDER BY r.posicion DESC
        `);

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
                t.nombre as tolerancia_nombre
            FROM roles r
            LEFT JOIN tolerancias t ON t.id = r.tolerancia_id
            WHERE r.id = $1
        `, [id]);

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
            tolerancia_id
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
            INSERT INTO roles (id, nombre, descripcion, posicion, permisos_bitwise, es_admin, es_empleado, tolerancia_id)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING *
        `, [id, nombre, descripcion, posicion, permisos_bitwise.toString(), es_admin, es_empleado, tolerancia_id]);

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
            tolerancia_id
        } = req.body;

        // Obtener rol actual para auditoría
        const rolActual = await client.query('SELECT * FROM roles WHERE id = $1', [id]);
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
                tolerancia_id = COALESCE($7, tolerancia_id)
            WHERE id = $8
            RETURNING *
        `, [nombre, descripcion, posicion, permisos_bitwise, es_admin, es_empleado, tolerancia_id, id]);

        await client.query('COMMIT');

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
 * Elimina un rol (solo si no tiene usuarios asignados)
 */
export async function deleteRol(req, res) {
    try {
        const { id } = req.params;

        // Verificar si tiene usuarios asignados
        const usuariosAsignados = await pool.query(
            'SELECT COUNT(*) FROM usuarios_roles WHERE rol_id = $1 AND es_activo = true',
            [id]
        );

        if (parseInt(usuariosAsignados.rows[0].count) > 0) {
            return res.status(400).json({
                success: false,
                message: 'No se puede eliminar un rol con usuarios asignados'
            });
        }

        const resultado = await pool.query('DELETE FROM roles WHERE id = $1 RETURNING id', [id]);

        if (resultado.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Rol no encontrado'
            });
        }

        res.json({
            success: true,
            message: 'Rol eliminado correctamente'
        });

    } catch (error) {
        console.error('Error en deleteRol:', error);
        res.status(500).json({
            success: false,
            message: 'Error al eliminar rol'
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
            WHERE ur.rol_id = $1 AND ur.es_activo = true
            ORDER BY u.nombre ASC
        `, [id]);

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
