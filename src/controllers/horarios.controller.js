import { pool } from '../config/db.js';
import { generateId, ID_PREFIXES } from '../utils/idGenerator.js';

/**
 * GET /api/horarios
 * Obtiene todos los horarios
 */
export async function getHorarios(req, res) {
    try {
        const { es_activo } = req.query;

        let query = `
            SELECT
                h.id,
                h.fecha_inicio,
                h.fecha_fin,
                h.configuracion,
                h.es_activo,
                (SELECT COUNT(*) FROM empleados e WHERE e.horario_id = h.id) as empleados_count
            FROM horarios h
            WHERE 1=1
        `;
        const params = [];

        if (es_activo !== undefined) {
            query += ` AND h.es_activo = $1`;
            params.push(es_activo === 'true');
        }

        query += ` ORDER BY h.fecha_inicio DESC`;

        const resultado = await pool.query(query, params);

        res.json({
            success: true,
            data: resultado.rows
        });

    } catch (error) {
        console.error('Error en getHorarios:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener horarios'
        });
    }
}

/**
 * GET /api/horarios/:id
 * Obtiene un horario por ID
 */
export async function getHorarioById(req, res) {
    try {
        const { id } = req.params;

        const resultado = await pool.query(`
            SELECT
                h.id,
                h.fecha_inicio,
                h.fecha_fin,
                h.configuracion,
                h.es_activo
            FROM horarios h
            WHERE h.id = $1
        `, [id]);

        if (resultado.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Horario no encontrado'
            });
        }

        // Obtener empleados con este horario
        const empleados = await pool.query(`
            SELECT e.id, u.nombre, u.correo
            FROM empleados e
            INNER JOIN usuarios u ON u.id = e.usuario_id
            WHERE e.horario_id = $1 AND u.estado_cuenta = 'activo'
        `, [id]);

        res.json({
            success: true,
            data: {
                ...resultado.rows[0],
                empleados: empleados.rows
            }
        });

    } catch (error) {
        console.error('Error en getHorarioById:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener horario'
        });
    }
}

/**
 * POST /api/horarios
 * Crea un nuevo horario
 *
 * Ejemplo de configuracion:
 * {
 *   "lunes": { "entrada": "08:00", "salida": "17:00", "descanso": false },
 *   "martes": { "entrada": "08:00", "salida": "17:00", "descanso": false },
 *   ...
 *   "domingo": { "descanso": true }
 * }
 */
export async function createHorario(req, res) {
    try {
        const {
            fecha_inicio,
            fecha_fin,
            configuracion,
            es_activo = true
        } = req.body;

        if (!fecha_inicio || !configuracion) {
            return res.status(400).json({
                success: false,
                message: 'fecha_inicio y configuracion son requeridos'
            });
        }

        const id = await generateId(ID_PREFIXES.HORARIO);

        const resultado = await pool.query(`
            INSERT INTO horarios (id, fecha_inicio, fecha_fin, configuracion, es_activo)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING *
        `, [id, fecha_inicio, fecha_fin, JSON.stringify(configuracion), es_activo]);

        res.status(201).json({
            success: true,
            message: 'Horario creado correctamente',
            data: resultado.rows[0]
        });

    } catch (error) {
        console.error('Error en createHorario:', error);
        res.status(500).json({
            success: false,
            message: 'Error al crear horario'
        });
    }
}

/**
 * PUT /api/horarios/:id
 * Actualiza un horario existente
 */
export async function updateHorario(req, res) {
    try {
        const { id } = req.params;
        const {
            fecha_inicio,
            fecha_fin,
            configuracion,
            es_activo
        } = req.body;

        const configJson = configuracion ? JSON.stringify(configuracion) : null;

        const resultado = await pool.query(`
            UPDATE horarios SET
                fecha_inicio = COALESCE($1, fecha_inicio),
                fecha_fin = COALESCE($2, fecha_fin),
                configuracion = COALESCE($3, configuracion),
                es_activo = COALESCE($4, es_activo)
            WHERE id = $5
            RETURNING *
        `, [fecha_inicio, fecha_fin, configJson, es_activo, id]);

        if (resultado.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Horario no encontrado'
            });
        }

        res.json({
            success: true,
            message: 'Horario actualizado correctamente',
            data: resultado.rows[0]
        });

    } catch (error) {
        console.error('Error en updateHorario:', error);
        res.status(500).json({
            success: false,
            message: 'Error al actualizar horario'
        });
    }
}

/**
 * DELETE /api/horarios/:id
 * Desactiva un horario (soft delete)
 */
export async function deleteHorario(req, res) {
    try {
        const { id } = req.params;

        // Verificar si tiene empleados asignados
        const empleados = await pool.query(
            'SELECT COUNT(*) FROM empleados WHERE horario_id = $1',
            [id]
        );

        if (parseInt(empleados.rows[0].count) > 0) {
            return res.status(400).json({
                success: false,
                message: 'No se puede eliminar un horario con empleados asignados'
            });
        }

        const resultado = await pool.query(`
            UPDATE horarios SET es_activo = false
            WHERE id = $1 AND es_activo = true
            RETURNING id
        `, [id]);

        if (resultado.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Horario no encontrado o ya desactivado'
            });
        }

        res.json({
            success: true,
            message: 'Horario desactivado correctamente'
        });

    } catch (error) {
        console.error('Error en deleteHorario:', error);
        res.status(500).json({
            success: false,
            message: 'Error al eliminar horario'
        });
    }
}

/**
 * POST /api/horarios/:id/asignar
 * Asigna un horario a uno o varios empleados
 */
export async function asignarHorario(req, res) {
    try {
        const { id } = req.params;
        const { empleados_ids } = req.body;

        if (!empleados_ids || !Array.isArray(empleados_ids)) {
            return res.status(400).json({
                success: false,
                message: 'empleados_ids debe ser un array'
            });
        }

        // Verificar que el horario existe
        const horario = await pool.query('SELECT id FROM horarios WHERE id = $1', [id]);
        if (horario.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Horario no encontrado'
            });
        }

        // Asignar a cada empleado
        const actualizados = await pool.query(`
            UPDATE empleados SET horario_id = $1
            WHERE id = ANY($2)
            RETURNING id
        `, [id, empleados_ids]);

        res.json({
            success: true,
            message: `Horario asignado a ${actualizados.rowCount} empleado(s)`
        });

    } catch (error) {
        console.error('Error en asignarHorario:', error);
        res.status(500).json({
            success: false,
            message: 'Error al asignar horario'
        });
    }
}
