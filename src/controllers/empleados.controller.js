import { pool } from '../config/db.js';
import { generateId, ID_PREFIXES } from '../utils/idGenerator.js';

/**
 * GET /api/empleados
 * Obtiene lista de empleados con información de usuario
 */
export async function getEmpleados(req, res) {
    try {
        const { departamento_id, buscar, limit = 50, offset = 0 } = req.query;

        let query = `
            SELECT
                e.id,
                e.rfc,
                e.nss,
                e.fecha_registro,
                e.horario_id,
                u.id as usuario_id,
                u.usuario,
                u.correo,
                u.nombre,
                u.foto,
                u.telefono,
                u.estado_cuenta,
                h.configuracion as horario_config
            FROM empleados e
            INNER JOIN usuarios u ON u.id = e.usuario_id
            LEFT JOIN horarios h ON h.id = e.horario_id
            WHERE u.estado_cuenta != 'baja'
        `;
        const params = [];
        let paramIndex = 1;

        if (departamento_id) {
            query += ` AND e.id IN (
                SELECT empleado_id FROM empleados_departamentos
                WHERE departamento_id = $${paramIndex++} AND es_activo = true
            )`;
            params.push(departamento_id);
        }

        if (buscar) {
            query += ` AND (u.nombre ILIKE $${paramIndex} OR e.rfc ILIKE $${paramIndex} OR e.nss ILIKE $${paramIndex})`;
            params.push(`%${buscar}%`);
            paramIndex++;
        }

        query += ` ORDER BY u.nombre ASC LIMIT $${paramIndex++} OFFSET $${paramIndex}`;
        params.push(parseInt(limit), parseInt(offset));

        const resultado = await pool.query(query, params);

        // Obtener departamentos de cada empleado
        for (const empleado of resultado.rows) {
            const deptos = await pool.query(`
                SELECT d.id, d.nombre, d.color
                FROM departamentos d
                INNER JOIN empleados_departamentos ed ON ed.departamento_id = d.id
                WHERE ed.empleado_id = $1 AND ed.es_activo = true
            `, [empleado.id]);
            empleado.departamentos = deptos.rows;
        }

        res.json({
            success: true,
            data: resultado.rows
        });

    } catch (error) {
        console.error('Error en getEmpleados:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener empleados'
        });
    }
}

/**
 * GET /api/empleados/:id
 * Obtiene un empleado por ID
 */
export async function getEmpleadoById(req, res) {
    try {
        const { id } = req.params;

        const resultado = await pool.query(`
            SELECT
                e.id,
                e.rfc,
                e.nss,
                e.fecha_registro,
                e.horario_id,
                e.usuario_id,
                u.usuario,
                u.correo,
                u.nombre,
                u.foto,
                u.telefono,
                u.estado_cuenta,
                h.id as horario_id,
                h.configuracion as horario_config,
                h.fecha_inicio as horario_inicio,
                h.fecha_fin as horario_fin
            FROM empleados e
            INNER JOIN usuarios u ON u.id = e.usuario_id
            LEFT JOIN horarios h ON h.id = e.horario_id
            WHERE e.id = $1
        `, [id]);

        if (resultado.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Empleado no encontrado'
            });
        }

        const empleado = resultado.rows[0];

        // Obtener departamentos
        const deptos = await pool.query(`
            SELECT d.id, d.nombre, d.descripcion, d.color
            FROM departamentos d
            INNER JOIN empleados_departamentos ed ON ed.departamento_id = d.id
            WHERE ed.empleado_id = $1 AND ed.es_activo = true
        `, [id]);

        // Obtener roles
        const roles = await pool.query(`
            SELECT r.id, r.nombre, r.es_admin, r.posicion
            FROM roles r
            INNER JOIN usuarios_roles ur ON ur.rol_id = r.id
            WHERE ur.usuario_id = $1 AND ur.es_activo = true
        `, [empleado.usuario_id]);

        res.json({
            success: true,
            data: {
                ...empleado,
                departamentos: deptos.rows,
                roles: roles.rows
            }
        });

    } catch (error) {
        console.error('Error en getEmpleadoById:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener empleado'
        });
    }
}

/**
 * PUT /api/empleados/:id
 * Actualiza información de empleado (RFC, NSS, horario)
 */
export async function updateEmpleado(req, res) {
    try {
        const { id } = req.params;
        const { rfc, nss, horario_id } = req.body;

        const resultado = await pool.query(`
            UPDATE empleados SET
                rfc = COALESCE($1, rfc),
                nss = COALESCE($2, nss),
                horario_id = COALESCE($3, horario_id)
            WHERE id = $4
            RETURNING *
        `, [rfc, nss, horario_id, id]);

        if (resultado.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Empleado no encontrado'
            });
        }

        res.json({
            success: true,
            message: 'Empleado actualizado correctamente',
            data: resultado.rows[0]
        });

    } catch (error) {
        console.error('Error en updateEmpleado:', error);
        res.status(500).json({
            success: false,
            message: 'Error al actualizar empleado'
        });
    }
}

/**
 * GET /api/empleados/:id/departamentos
 * Obtiene los departamentos de un empleado
 */
export async function getDepartamentosDeEmpleado(req, res) {
    try {
        const { id } = req.params;

        const resultado = await pool.query(`
            SELECT
                d.id,
                d.nombre,
                d.descripcion,
                d.color,
                ed.fecha_registro as fecha_asignacion
            FROM departamentos d
            INNER JOIN empleados_departamentos ed ON ed.departamento_id = d.id
            WHERE ed.empleado_id = $1 AND ed.es_activo = true AND d.es_activo = true
        `, [id]);

        res.json({
            success: true,
            data: resultado.rows
        });

    } catch (error) {
        console.error('Error en getDepartamentosDeEmpleado:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener departamentos'
        });
    }
}

/**
 * POST /api/empleados/:id/departamentos
 * Asigna un empleado a un departamento
 */
export async function asignarDepartamento(req, res) {
    try {
        const { id } = req.params;
        const { departamento_id } = req.body;

        if (!departamento_id) {
            return res.status(400).json({
                success: false,
                message: 'departamento_id es requerido'
            });
        }

        // Verificar si ya existe la asignación
        const existe = await pool.query(
            'SELECT id, es_activo FROM empleados_departamentos WHERE empleado_id = $1 AND departamento_id = $2',
            [id, departamento_id]
        );

        if (existe.rows.length > 0) {
            if (existe.rows[0].es_activo) {
                return res.status(400).json({
                    success: false,
                    message: 'El empleado ya está asignado a este departamento'
                });
            }
            // Reactivar
            await pool.query(
                'UPDATE empleados_departamentos SET es_activo = true WHERE id = $1',
                [existe.rows[0].id]
            );
        } else {
            const edId = await generateId(ID_PREFIXES.EMP_DEPTO);
            await pool.query(`
                INSERT INTO empleados_departamentos (id, empleado_id, departamento_id, es_activo)
                VALUES ($1, $2, $3, true)
            `, [edId, id, departamento_id]);
        }

        res.json({
            success: true,
            message: 'Empleado asignado al departamento'
        });

    } catch (error) {
        console.error('Error en asignarDepartamento:', error);
        res.status(500).json({
            success: false,
            message: 'Error al asignar departamento'
        });
    }
}

/**
 * DELETE /api/empleados/:id/departamentos/:deptoId
 * Remueve un empleado de un departamento
 */
export async function removerDepartamento(req, res) {
    try {
        const { id, deptoId } = req.params;

        const resultado = await pool.query(`
            UPDATE empleados_departamentos SET es_activo = false
            WHERE empleado_id = $1 AND departamento_id = $2 AND es_activo = true
            RETURNING id
        `, [id, deptoId]);

        if (resultado.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'El empleado no está asignado a ese departamento'
            });
        }

        res.json({
            success: true,
            message: 'Empleado removido del departamento'
        });

    } catch (error) {
        console.error('Error en removerDepartamento:', error);
        res.status(500).json({
            success: false,
            message: 'Error al remover del departamento'
        });
    }
}

/**
 * GET /api/empleados/:id/horario
 * Obtiene el horario activo de un empleado
 */
export async function getHorarioDeEmpleado(req, res) {
    try {
        const { id } = req.params;

        const empleado = await pool.query(
            'SELECT id, horario_id FROM empleados WHERE id = $1',
            [id]
        );

        if (empleado.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Empleado no encontrado'
            });
        }

        if (!empleado.rows[0].horario_id) {
            return res.status(404).json({
                success: false,
                message: 'El empleado no tiene un horario asignado'
            });
        }

        const horario = await pool.query(`
            SELECT
                id,
                fecha_inicio,
                fecha_fin,
                configuracion,
                es_activo
            FROM horarios
            WHERE id = $1
        `, [empleado.rows[0].horario_id]);

        if (horario.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Horario no encontrado'
            });
        }

        res.json({
            success: true,
            data: horario.rows[0]
        });

    } catch (error) {
        console.error('Error en getHorarioDeEmpleado:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener horario del empleado'
        });
    }
}

/**
 * GET /api/empleados/buscar/rfc/:rfc
 * Busca empleado por RFC
 */
export async function buscarPorRFC(req, res) {
    try {
        const { rfc } = req.params;

        const resultado = await pool.query(`
            SELECT e.id, e.rfc, e.nss, u.nombre, u.correo
            FROM empleados e
            INNER JOIN usuarios u ON u.id = e.usuario_id
            WHERE e.rfc = $1 AND u.estado_cuenta = 'activo'
        `, [rfc]);

        if (resultado.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Empleado no encontrado'
            });
        }

        res.json({
            success: true,
            data: resultado.rows[0]
        });

    } catch (error) {
        console.error('Error en buscarPorRFC:', error);
        res.status(500).json({
            success: false,
            message: 'Error al buscar empleado'
        });
    }
}

/**
 * GET /api/empleados/buscar/nss/:nss
 * Busca empleado por NSS
 */
export async function buscarPorNSS(req, res) {
    try {
        const { nss } = req.params;

        const resultado = await pool.query(`
            SELECT e.id, e.rfc, e.nss, u.nombre, u.correo
            FROM empleados e
            INNER JOIN usuarios u ON u.id = e.usuario_id
            WHERE e.nss = $1 AND u.estado_cuenta = 'activo'
        `, [nss]);

        if (resultado.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Empleado no encontrado'
            });
        }

        res.json({
            success: true,
            data: resultado.rows[0]
        });

    } catch (error) {
        console.error('Error en buscarPorNSS:', error);
        res.status(500).json({
            success: false,
            message: 'Error al buscar empleado'
        });
    }
}
