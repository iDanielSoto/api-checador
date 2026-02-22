import bcrypt from 'bcrypt';
import { pool } from '../config/db.js';
import { generateId, generateSecurityKey, ID_PREFIXES } from '../utils/idGenerator.js';
import { registrarEvento, TIPOS_EVENTO, PRIORIDADES } from '../utils/eventos.js';
import { broadcast } from '../utils/sse.js';

/**
 * GET /api/usuarios
 * Obtiene lista de usuarios con filtros opcionales
 */
export async function getUsuarios(req, res) {
    try {
        const { estado, es_empleado, buscar, limit = 50, offset = 0 } = req.query;

        let query = `
            SELECT
                u.id,
                u.usuario,
                u.correo,
                u.nombre,
                u.foto,
                u.telefono,
                u.estado_cuenta,
                u.es_empleado,
                u.empresa_id,
                u.fecha_registro,
                e.id as empleado_id,
                e.rfc,
                e.nss,
                emp.nombre as empresa_nombre
            FROM usuarios u
            LEFT JOIN empleados e ON e.usuario_id = u.id
            LEFT JOIN empresas emp ON emp.id = u.empresa_id
            WHERE u.empresa_id = $1
        `;
        const params = [req.empresa_id];
        let paramIndex = 2;

        if (estado) {
            query += ` AND u.estado_cuenta = $${paramIndex++}`;
            params.push(estado);
        }

        if (es_empleado !== undefined) {
            query += ` AND u.es_empleado = $${paramIndex++}`;
            params.push(es_empleado === 'true');
        }

        if (buscar) {
            query += ` AND (u.nombre ILIKE $${paramIndex} OR u.usuario ILIKE $${paramIndex} OR u.correo ILIKE $${paramIndex})`;
            params.push(`%${buscar}%`);
            paramIndex++;
        }

        query += ` ORDER BY u.fecha_registro DESC LIMIT $${paramIndex++} OFFSET $${paramIndex}`;
        params.push(parseInt(limit), parseInt(offset));

        const resultado = await pool.query(query, params);

        // Contar total
        let countQuery = `SELECT COUNT(*) FROM usuarios u WHERE u.empresa_id = $1`;
        const countParams = [req.empresa_id];
        let countIndex = 2;

        if (estado) {
            countQuery += ` AND u.estado_cuenta = $${countIndex++}`;
            countParams.push(estado);
        }
        if (es_empleado !== undefined) {
            countQuery += ` AND u.es_empleado = $${countIndex++}`;
            countParams.push(es_empleado === 'true');
        }
        if (buscar) {
            countQuery += ` AND (u.nombre ILIKE $${countIndex} OR u.usuario ILIKE $${countIndex} OR u.correo ILIKE $${countIndex})`;
            countParams.push(`%${buscar}%`);
        }

        const countResult = await pool.query(countQuery, countParams);

        res.json({
            success: true,
            data: resultado.rows,
            total: parseInt(countResult.rows[0].count),
            limit: parseInt(limit),
            offset: parseInt(offset)
        });

    } catch (error) {
        console.error('Error en getUsuarios:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener usuarios'
        });
    }
}

/**
 * GET /api/usuarios/:id
 * Obtiene un usuario por ID
 */
export async function getUsuarioById(req, res) {
    try {
        const { id } = req.params;

        const resultado = await pool.query(`
            SELECT
                u.id,
                u.usuario,
                u.correo,
                u.nombre,
                u.foto,
                u.telefono,
                u.estado_cuenta,
                u.es_empleado,
                u.empresa_id,
                u.fecha_registro,
                e.id as empleado_id,
                e.rfc,
                e.nss,
                e.horario_id,
                emp.nombre as empresa_nombre
            FROM usuarios u
            LEFT JOIN empleados e ON e.usuario_id = u.id
            LEFT JOIN empresas emp ON emp.id = u.empresa_id
            WHERE u.id = $1
        `, [id]);

        if (resultado.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Usuario no encontrado'
            });
        }

        // Obtener roles del usuario
        const rolesResult = await pool.query(`
            SELECT r.id, r.nombre, r.descripcion, r.es_admin, r.es_empleado, r.tolerancia_id, r.posicion
            FROM roles r
            INNER JOIN usuarios_roles ur ON ur.rol_id = r.id
            WHERE ur.usuario_id = $1 AND ur.es_activo = true
            ORDER BY r.posicion ASC
        `, [id]);

        // Obtener departamentos del empleado
        let departamentos = [];
        const usuario = resultado.rows[0];
        if (usuario.empleado_id) {
            const deptosResult = await pool.query(`
                SELECT d.id, d.nombre, d.color
                FROM departamentos d
                INNER JOIN empleados_departamentos ed ON ed.departamento_id = d.id
                WHERE ed.empleado_id = $1 AND ed.es_activo = true
            `, [usuario.empleado_id]);
            departamentos = deptosResult.rows;
        }

        res.json({
            success: true,
            data: {
                ...usuario,
                roles: rolesResult.rows,
                departamentos
            }
        });

    } catch (error) {
        console.error('Error en getUsuarioById:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener usuario'
        });
    }
}

/**
 * POST /api/usuarios
 * Crea un nuevo usuario
 */
export async function createUsuario(req, res) {
    const client = await pool.connect();

    try {
        const {
            usuario,
            correo,
            contraseña,
            nombre,
            foto,
            telefono,
            es_empleado = false,
            empresa_id = req.usuario?.empresa_id,
            roles = [],
            // Datos de empleado (si es_empleado = true)
            rfc,
            nss,
            horario_id,
            departamentos_ids = []
        } = req.body;

        // Validaciones
        if (!usuario || !correo || !contraseña || !nombre) {
            return res.status(400).json({
                success: false,
                message: 'Usuario, correo, contraseña y nombre son requeridos'
            });
        }

        // Verificar unicidad
        const existe = await client.query(
            'SELECT id FROM usuarios WHERE usuario = $1 OR correo = $2',
            [usuario, correo]
        );

        if (existe.rows.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'El usuario o correo ya existe'
            });
        }

        await client.query('BEGIN');

        // ==== Validaciones SaaS ====
        if (empresa_id) {
            const empresaRes = await client.query('SELECT limite_empleados, fecha_vencimiento, es_activo FROM empresas WHERE id = $1', [empresa_id]);
            if (empresaRes.rows.length > 0) {
                const empData = empresaRes.rows[0];

                // Verificar si la empresa está suspendida
                if (!empData.es_activo) {
                    await client.query('ROLLBACK');
                    return res.status(403).json({
                        success: false,
                        message: 'La instancia de esta empresa se encuentra suspendida.'
                    });
                }

                // Verificar vencimiento de licencia
                if (empData.fecha_vencimiento && new Date(empData.fecha_vencimiento) < new Date()) {
                    await client.query('ROLLBACK');
                    return res.status(403).json({
                        success: false,
                        message: 'La licencia SaaS para esta empresa ha expirado.'
                    });
                }

                // Verificar límite de empleados solo si el usuario a crear es empleado
                if (es_empleado && empData.limite_empleados !== null) {
                    const conteoRes = await client.query(`
                        SELECT COUNT(*) as total 
                        FROM usuarios u
                        INNER JOIN empleados e ON e.usuario_id = u.id
                        WHERE u.empresa_id = $1 AND u.estado_cuenta = 'activo'
                    `, [empresa_id]);

                    if (parseInt(conteoRes.rows[0].total) >= empData.limite_empleados) {
                        await client.query('ROLLBACK');
                        return res.status(403).json({
                            success: false,
                            message: `Se ha alcanzado el límite máximo de ${empData.limite_empleados} empleados permitido por su plan.`
                        });
                    }
                }
            }
        }
        // ==== Fin Validaciones SaaS ====

        // Generar ID y hash
        const id = await generateId(ID_PREFIXES.USUARIO);
        const hashPassword = await bcrypt.hash(contraseña, 10);
        const clave_seguridad = generateSecurityKey();

        // Insertar usuario
        await client.query(`
            INSERT INTO usuarios (id, usuario, correo, contraseña, nombre, foto, telefono, estado_cuenta, es_empleado, clave_seguridad, empresa_id)
            VALUES ($1, $2, $3, $4, $5, $6, $7, 'activo', $8, $9, $10)
        `, [id, usuario, correo, hashPassword, nombre, foto, telefono, es_empleado, clave_seguridad, empresa_id || null]);

        // Si es empleado, crear registro en empleados
        let empleado_id = null;
        if (es_empleado) {
            empleado_id = await generateId(ID_PREFIXES.EMPLEADO);
            await client.query(`
                INSERT INTO empleados (id, rfc, nss, horario_id, usuario_id)
                VALUES ($1, $2, $3, $4, $5)
            `, [empleado_id, rfc, nss, horario_id, id]);

            // Asignar departamentos al empleado
            for (const depto_id of departamentos_ids) {
                const edId = await generateId(ID_PREFIXES.EMP_DEPTO);
                await client.query(`
                    INSERT INTO empleados_departamentos (id, empleado_id, departamento_id, es_activo)
                    VALUES ($1, $2, $3, true)
                `, [edId, empleado_id, depto_id]);
            }
        }

        // Si es empleado, añade el rol
        let rolesFinales = [...roles];

        // Si es empleado, agregar automáticamente el rol "Empleado"
        if (es_empleado) {
            const rolEmpleado = await client.query(
                'SELECT id FROM roles WHERE es_empleado = true LIMIT 1'
            );
            if (rolEmpleado.rows.length > 0) {
                rolesFinales.push(rolEmpleado.rows[0].id);
            }
        }

        // Eliminar duplicados usando Set
        rolesFinales = [...new Set(rolesFinales)];

        // Asignar roles
        for (const rol_id of rolesFinales) {
            const urlId = await generateId(ID_PREFIXES.USUARIO_ROL);
            await client.query(`
                INSERT INTO usuarios_roles (id, usuario_id, rol_id, es_activo)
                VALUES ($1, $2, $3, true)
            `, [urlId, id, rol_id]);
        }

        await client.query('COMMIT');

        // Registrar evento
        await registrarEvento({
            titulo: 'Usuario creado',
            descripcion: `Se creó el usuario ${usuario} (${nombre})`,
            tipo_evento: TIPOS_EVENTO.USUARIO,
            prioridad: PRIORIDADES.MEDIA,
            empleado_id: empleado_id,
            usuario_modificador_id: req.usuario?.id,
            detalles: { usuario_id: id, usuario, correo, es_empleado }
        });

        res.status(201).json({
            success: true,
            message: 'Usuario creado correctamente',
            data: {
                id,
                usuario,
                correo,
                nombre,
                es_empleado,
                empleado_id
            }
        });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error en createUsuario:', error);
        res.status(500).json({
            success: false,
            message: 'Error al crear usuario'
        });
    } finally {
        client.release();
    }
}

/**
 * PUT /api/usuarios/:id
 * Actualiza un usuario existente
 */
export async function updateUsuario(req, res) {
    const client = await pool.connect();

    try {
        const { id } = req.params;
        const {
            usuario,
            correo,
            nombre,
            foto,
            telefono,
            estado_cuenta,
            es_empleado,
            empresa_id,
            roles,
            // Datos de empleado
            rfc,
            nss,
            horario_id,
            departamentos_ids
        } = req.body;

        // Verificar que existe
        const existe = await client.query(
            'SELECT id, es_empleado FROM usuarios WHERE id = $1',
            [id]
        );
        if (existe.rows.length === 0) {
            // client.release() removido porque hay un finally
            return res.status(404).json({
                success: false,
                message: 'Usuario no encontrado'
            });
        }

        const esEmpleadoActual = existe.rows[0].es_empleado;

        // Verificar unicidad de usuario si se cambia
        if (usuario) {
            const duplicado = await client.query(
                'SELECT id FROM usuarios WHERE usuario = $1 AND id != $2',
                [usuario, id]
            );
            if (duplicado.rows.length > 0) {
                // client.release() removido porque hay un finally
                return res.status(400).json({
                    success: false,
                    message: 'El nombre de usuario ya está en uso'
                });
            }
        }

        await client.query('BEGIN');

        // Actualizar usuario
        // Para foto: cadena vacía = eliminar foto, null/undefined = mantener, valor = actualizar
        const fotoValue = foto === '' ? null : foto;
        const fotoQuery = foto === '' ? '$4' : 'COALESCE($4, foto)';

        const resultado = await client.query(`
            UPDATE usuarios SET
                usuario = COALESCE($1, usuario),
                correo = COALESCE($2, correo),
                nombre = COALESCE($3, nombre),
                foto = ${fotoQuery},
                telefono = COALESCE($5, telefono),
                estado_cuenta = COALESCE($6, estado_cuenta),
                es_empleado = COALESCE($7, es_empleado),
                empresa_id = COALESCE($8, empresa_id)
            WHERE id = $9
            RETURNING id, usuario, correo, nombre, foto, telefono, estado_cuenta, es_empleado, empresa_id
        `, [usuario, correo, nombre, fotoValue, telefono, estado_cuenta, es_empleado, empresa_id, id]);

        // Manejar cambios en es_empleado
        if (es_empleado !== undefined) {
            if (es_empleado && !esEmpleadoActual) {
                // Crear registro de empleado
                const empleadoId = await generateId(ID_PREFIXES.EMPLEADO);
                await client.query(`
                    INSERT INTO empleados (id, rfc, nss, horario_id, usuario_id)
                    VALUES ($1, $2, $3, $4, $5)
                `, [empleadoId, rfc || null, nss || null, horario_id || null, id]);

                // Asignar departamentos al nuevo empleado
                if (departamentos_ids && departamentos_ids.length > 0) {
                    for (const depto_id of departamentos_ids) {
                        const edId = await generateId(ID_PREFIXES.EMP_DEPTO);
                        await client.query(`
                            INSERT INTO empleados_departamentos (id, empleado_id, departamento_id, es_activo)
                            VALUES ($1, $2, $3, true)
                        `, [edId, empleadoId, depto_id]);
                    }
                }
            } else if (!es_empleado && esEmpleadoActual) {
                // Obtener empleado_id antes de eliminar
                const empResult = await client.query('SELECT id FROM empleados WHERE usuario_id = $1', [id]);
                if (empResult.rows.length > 0) {
                    const empleadoId = empResult.rows[0].id;
                    // Eliminar relaciones de departamentos
                    await client.query('DELETE FROM empleados_departamentos WHERE empleado_id = $1', [empleadoId]);
                }
                // Eliminar registro de empleado
                await client.query('DELETE FROM empleados WHERE usuario_id = $1', [id]);
            } else if (es_empleado && esEmpleadoActual) {
                // Actualizar datos de empleado
                await client.query(`
                    UPDATE empleados SET
                        rfc = COALESCE($1, rfc),
                        nss = COALESCE($2, nss),
                        horario_id = $3
                    WHERE usuario_id = $4
                `, [rfc, nss, horario_id || null, id]);

                // Sincronizar departamentos si se proporcionaron
                if (departamentos_ids !== undefined) {
                    const empResult = await client.query('SELECT id FROM empleados WHERE usuario_id = $1', [id]);
                    if (empResult.rows.length > 0) {
                        const empleadoId = empResult.rows[0].id;

                        // Desactivar todos los departamentos actuales
                        await client.query(`
                            UPDATE empleados_departamentos SET es_activo = false
                            WHERE empleado_id = $1
                        `, [empleadoId]);

                        // Activar o crear los departamentos seleccionados
                        for (const depto_id of departamentos_ids) {
                            const existe = await client.query(`
                                SELECT id FROM empleados_departamentos
                                WHERE empleado_id = $1 AND departamento_id = $2
                            `, [empleadoId, depto_id]);

                            if (existe.rows.length > 0) {
                                await client.query(`
                                    UPDATE empleados_departamentos SET es_activo = true
                                    WHERE empleado_id = $1 AND departamento_id = $2
                                `, [empleadoId, depto_id]);
                            } else {
                                const edId = await generateId(ID_PREFIXES.EMP_DEPTO);
                                await client.query(`
                                    INSERT INTO empleados_departamentos (id, empleado_id, departamento_id, es_activo)
                                    VALUES ($1, $2, $3, true)
                                `, [edId, empleadoId, depto_id]);
                            }
                        }
                    }
                }
            }
        }

        // ===== LÓGICA AUTOMÁTICA DEL ROL EMPLEADO =====
        // Obtener el ID del rol Empleado
        const rolEmpleadoResult = await client.query(
            'SELECT id FROM roles WHERE es_empleado = true LIMIT 1'
        );
        const rolEmpleadoId = rolEmpleadoResult.rows[0]?.id;

        if (roles !== undefined) {
            // Si se envían roles explícitamente
            let rolesFinales = [...roles];

            // Si es empleado, agregar automáticamente el rol "Empleado"
            if (es_empleado && rolEmpleadoId) {
                rolesFinales.push(rolEmpleadoId);
            }

            // Si NO es empleado, quitar el rol "Empleado"
            if (es_empleado === false && rolEmpleadoId) {
                rolesFinales = rolesFinales.filter(r => r !== rolEmpleadoId);
            }

            // Eliminar duplicados
            rolesFinales = [...new Set(rolesFinales)];

            // Desactivar todos los roles actuales
            await client.query(
                'UPDATE usuarios_roles SET es_activo = false WHERE usuario_id = $1',
                [id]
            );

            // Asignar los nuevos roles
            for (const rol_id of rolesFinales) {
                // Verificar si ya existe la relación
                const existeRol = await client.query(
                    'SELECT id FROM usuarios_roles WHERE usuario_id = $1 AND rol_id = $2',
                    [id, rol_id]
                );

                if (existeRol.rows.length > 0) {
                    // Reactivar
                    await client.query(
                        'UPDATE usuarios_roles SET es_activo = true WHERE usuario_id = $1 AND rol_id = $2',
                        [id, rol_id]
                    );
                } else {
                    // Crear nueva relación
                    const urlId = await generateId(ID_PREFIXES.USUARIO_ROL);
                    await client.query(`
                        INSERT INTO usuarios_roles (id, usuario_id, rol_id, es_activo)
                        VALUES ($1, $2, $3, true)
                    `, [urlId, id, rol_id]);
                }
            }
        } else if (es_empleado !== undefined && rolEmpleadoId) {
            // Si NO se enviaron roles pero SÍ cambió es_empleado
            // Solo gestionar el rol Empleado sin tocar los demás roles

            if (es_empleado) {
                // Agregar o activar el rol Empleado
                const tieneRolEmpleado = await client.query(
                    'SELECT id FROM usuarios_roles WHERE usuario_id = $1 AND rol_id = $2',
                    [id, rolEmpleadoId]
                );

                if (tieneRolEmpleado.rows.length > 0) {
                    // Ya existe, solo activarlo
                    await client.query(
                        'UPDATE usuarios_roles SET es_activo = true WHERE usuario_id = $1 AND rol_id = $2',
                        [id, rolEmpleadoId]
                    );
                } else {
                    // Crear nueva relación
                    const urlId = await generateId(ID_PREFIXES.USUARIO_ROL);
                    await client.query(`
                        INSERT INTO usuarios_roles (id, usuario_id, rol_id, es_activo)
                        VALUES ($1, $2, $3, true)
                    `, [urlId, id, rolEmpleadoId]);
                }
            } else {
                // Desactivar el rol Empleado
                await client.query(
                    'UPDATE usuarios_roles SET es_activo = false WHERE usuario_id = $1 AND rol_id = $2',
                    [id, rolEmpleadoId]
                );
            }
        }

        await client.query('COMMIT');

        // Registrar evento
        await registrarEvento({
            titulo: 'Usuario actualizado',
            descripcion: `Se actualizó el usuario ${resultado.rows[0].usuario}`,
            tipo_evento: TIPOS_EVENTO.USUARIO,
            prioridad: PRIORIDADES.BAJA,
            usuario_modificador_id: req.usuario?.id,
            detalles: { usuario_id: id, cambios: req.body }
        });

        // Notificar via SSE
        broadcast('usuario-actualizado', {
            id,
            ...resultado.rows[0]
        });

        res.json({
            success: true,
            message: 'Usuario actualizado correctamente',
            data: resultado.rows[0]
        });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error en updateUsuario:', error);
        res.status(500).json({
            success: false,
            message: 'Error al actualizar usuario'
        });
    } finally {
        client.release();
    }
}

/**
 * DELETE /api/usuarios/:id
 * Soft delete - cambia estado a 'baja'
 */
export async function deleteUsuario(req, res) {
    try {
        const { id } = req.params;

        const resultado = await pool.query(`
            UPDATE usuarios SET estado_cuenta = 'baja'
            WHERE id = $1 AND estado_cuenta != 'baja'
            RETURNING id
        `, [id]);

        if (resultado.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Usuario no encontrado o ya dado de baja'
            });
        }

        // Registrar evento
        await registrarEvento({
            titulo: 'Usuario dado de baja',
            descripcion: `Se dio de baja al usuario con ID ${id}`,
            tipo_evento: TIPOS_EVENTO.USUARIO,
            prioridad: PRIORIDADES.ALTA,
            usuario_modificador_id: req.usuario?.id,
            detalles: { usuario_id: id }
        });

        res.json({
            success: true,
            message: 'Usuario dado de baja correctamente'
        });

    } catch (error) {
        console.error('Error en deleteUsuario:', error);
        res.status(500).json({
            success: false,
            message: 'Error al eliminar usuario'
        });
    }
}

/**
 * PATCH /api/usuarios/:id/reactivar
 * Reactiva un usuario dado de baja
 */
export async function reactivarUsuario(req, res) {
    try {
        const { id } = req.params;

        const resultado = await pool.query(`
            UPDATE usuarios SET estado_cuenta = 'activo'
            WHERE id = $1 AND estado_cuenta = 'baja'
            RETURNING id, nombre
        `, [id]);

        if (resultado.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Usuario no encontrado o no está dado de baja'
            });
        }

        await registrarEvento({
            titulo: 'Usuario reactivado',
            descripcion: `Se reactivó al usuario "${resultado.rows[0].nombre}"`,
            tipo_evento: TIPOS_EVENTO.USUARIO,
            prioridad: PRIORIDADES.ALTA,
            usuario_modificador_id: req.usuario?.id,
            detalles: { usuario_id: id }
        });

        res.json({
            success: true,
            message: 'Usuario reactivado correctamente'
        });

    } catch (error) {
        console.error('Error en reactivarUsuario:', error);
        res.status(500).json({
            success: false,
            message: 'Error al reactivar usuario'
        });
    }
}

/**
 * GET /api/usuarios/:id/roles
 * Obtiene los roles de un usuario
 */
export async function getRolesDeUsuario(req, res) {
    try {
        const { id } = req.params;

        const resultado = await pool.query(`
            SELECT
                r.id,
                r.nombre,
                r.descripcion,
                r.permisos_bitwise,
                r.es_admin,
                r.es_empleado,
                r.tolerancia_id,
                r.posicion,
                ur.fecha_registro as fecha_asignacion
            FROM roles r
            INNER JOIN usuarios_roles ur ON ur.rol_id = r.id
            WHERE ur.usuario_id = $1 AND ur.es_activo = true
            ORDER BY r.posicion ASC
        `, [id]);

        res.json({
            success: true,
            data: resultado.rows
        });

    } catch (error) {
        console.error('Error en getRolesDeUsuario:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener roles del usuario'
        });
    }
}

/**
 * POST /api/usuarios/:id/roles
 * Asigna un rol a un usuario
 */
export async function asignarRol(req, res) {
    try {
        const { id } = req.params;
        const { rol_id } = req.body;

        if (!rol_id) {
            return res.status(400).json({
                success: false,
                message: 'rol_id es requerido'
            });
        }

        // Verificar si ya tiene el rol
        const existe = await pool.query(
            'SELECT id FROM usuarios_roles WHERE usuario_id = $1 AND rol_id = $2',
            [id, rol_id]
        );

        if (existe.rows.length > 0) {
            // Reactivar si estaba inactivo
            await pool.query(
                'UPDATE usuarios_roles SET es_activo = true WHERE usuario_id = $1 AND rol_id = $2',
                [id, rol_id]
            );
        } else {
            const urlId = await generateId(ID_PREFIXES.USUARIO_ROL);
            await pool.query(`
                INSERT INTO usuarios_roles (id, usuario_id, rol_id, es_activo)
                VALUES ($1, $2, $3, true)
            `, [urlId, id, rol_id]);
        }

        // Registrar evento
        await registrarEvento({
            titulo: 'Rol asignado a usuario',
            descripcion: `Se asignó un rol al usuario ${id}`,
            tipo_evento: TIPOS_EVENTO.ROL,
            prioridad: PRIORIDADES.MEDIA,
            usuario_modificador_id: req.usuario?.id,
            detalles: { usuario_id: id, rol_id }
        });

        res.json({
            success: true,
            message: 'Rol asignado correctamente'
        });

    } catch (error) {
        console.error('Error en asignarRol:', error);
        res.status(500).json({
            success: false,
            message: 'Error al asignar rol'
        });
    }
}

/**
 * DELETE /api/usuarios/:id/roles/:rolId
 * Remueve un rol de un usuario
 */
export async function removerRol(req, res) {
    try {
        const { id, rolId } = req.params;

        const resultado = await pool.query(`
            UPDATE usuarios_roles SET es_activo = false
            WHERE usuario_id = $1 AND rol_id = $2 AND es_activo = true
            RETURNING id
        `, [id, rolId]);

        if (resultado.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'El usuario no tiene asignado ese rol'
            });
        }

        // Registrar evento
        await registrarEvento({
            titulo: 'Rol removido de usuario',
            descripcion: `Se removió un rol del usuario ${id}`,
            tipo_evento: TIPOS_EVENTO.ROL,
            prioridad: PRIORIDADES.MEDIA,
            usuario_modificador_id: req.usuario?.id,
            detalles: { usuario_id: id, rol_id: rolId }
        });

        res.json({
            success: true,
            message: 'Rol removido correctamente'
        });

    } catch (error) {
        console.error('Error en removerRol:', error);
        res.status(500).json({
            success: false,
            message: 'Error al remover rol'
        });
    }
}

/**
 * GET /api/usuarios/username/:username
 * Obtiene un usuario por su username con datos completos para perfil
 */
export async function getUsuarioByUsername(req, res) {
    try {
        const { username } = req.params;

        const resultado = await pool.query(`
            SELECT
                u.id,
                u.usuario,
                u.correo,
                u.nombre,
                u.foto,
                u.telefono,
                u.estado_cuenta,
                u.es_empleado,
                u.empresa_id,
                u.fecha_registro,
                e.id as empleado_id,
                e.rfc,
                e.nss,
                e.horario_id,
                emp.nombre as empresa_nombre
            FROM usuarios u
            LEFT JOIN empleados e ON e.usuario_id = u.id
            LEFT JOIN empresas emp ON emp.id = u.empresa_id
            WHERE u.usuario = $1
        `, [username]);

        if (resultado.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Usuario no encontrado'
            });
        }

        const usuario = resultado.rows[0];

        // Obtener roles del usuario
        const rolesResult = await pool.query(`
            SELECT r.nombre, r.descripcion, r.es_admin, r.es_empleado
            FROM roles r
            INNER JOIN usuarios_roles ur ON ur.rol_id = r.id
            WHERE ur.usuario_id = $1 AND ur.es_activo = true
            ORDER BY r.posicion DESC
        `, [usuario.id]);

        // Obtener horario si es empleado
        let horario = null;
        if (usuario.horario_id) {
            const horarioResult = await pool.query(`
                SELECT h.fecha_inicio, h.fecha_fin, h.es_activo, h.configuracion
                FROM horarios h
                WHERE h.id = $1
            `, [usuario.horario_id]);

            if (horarioResult.rows.length > 0) {
                horario = horarioResult.rows[0];
            }
        }

        // Remover informacion sensible pero MANTENER EL ID
        const { contraseña, ...usuarioSeguro } = usuario;

        res.json({
            success: true,
            data: {
                ...usuarioSeguro,
                roles: rolesResult.rows,
                horario
            }
        });

    } catch (error) {
        console.error('Error en getUsuarioByUsername:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener usuario'
        });
    }
}