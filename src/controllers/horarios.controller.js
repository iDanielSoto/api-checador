import { pool } from '../config/db.js';
import { generateId, ID_PREFIXES } from '../utils/idGenerator.js';
import { registrarEvento, TIPOS_EVENTO, PRIORIDADES } from '../utils/eventos.js';

/**
 * GET /api/horarios
 * Obtiene todos los horarios con información del empleado
 */
export async function getHorarios(req, res) {
    try {
        const { es_activo, buscar } = req.query;

        let query = `
            SELECT
                h.id,
                h.fecha_inicio,
                h.fecha_fin,
                h.configuracion,
                h.es_activo,
                e.id as empleado_id,
                u.nombre as empleado_nombre,
                u.correo as empleado_correo
            FROM horarios h
            LEFT JOIN empleados e ON e.horario_id = h.id
            LEFT JOIN usuarios u ON u.id = e.usuario_id
            WHERE 1=1
        `;
        const params = [];
        let paramIndex = 1;

        if (es_activo !== undefined) {
            query += ` AND h.es_activo = $${paramIndex++}`;
            params.push(es_activo === 'true');
        }

        if (buscar) {
            query += ` AND u.nombre ILIKE $${paramIndex++}`;
            params.push(`%${buscar}%`);
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
 * Obtiene un horario por ID con información del empleado
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
                h.es_activo,
                e.id as empleado_id,
                u.nombre as empleado_nombre
            FROM horarios h
            LEFT JOIN empleados e ON e.horario_id = h.id
            LEFT JOIN usuarios u ON u.id = e.usuario_id
            WHERE h.id = $1
        `, [id]);

        if (resultado.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Horario no encontrado'
            });
        }

        res.json({
            success: true,
            data: resultado.rows[0]
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
 * Crea un nuevo horario y lo asigna a un empleado
 */
export async function createHorario(req, res) {
    const client = await pool.connect();

    try {
        const {
            empleado_id,
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

        if (!empleado_id) {
            return res.status(400).json({
                success: false,
                message: 'empleado_id es requerido'
            });
        }

        await client.query('BEGIN');

        const id = await generateId(ID_PREFIXES.HORARIO);

        // Crear el horario
        const horarioResult = await client.query(`
            INSERT INTO horarios (id, fecha_inicio, fecha_fin, configuracion, es_activo)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING *
        `, [id, fecha_inicio, fecha_fin, JSON.stringify(configuracion), es_activo]);

        // Asignar el horario al empleado
        await client.query(`
            UPDATE empleados 
            SET horario_id = $1
            WHERE id = $2
        `, [id, empleado_id]);

        await client.query('COMMIT');

        // Registrar evento
        await registrarEvento({
            titulo: 'Horario creado',
            descripcion: `Se creó y asignó un nuevo horario al empleado ${empleado_id}`,
            tipo_evento: TIPOS_EVENTO.HORARIO,
            prioridad: PRIORIDADES.MEDIA,
            empleado_id: empleado_id,
            usuario_modificador_id: req.usuario?.id,
            detalles: { horario_id: id, fecha_inicio, fecha_fin }
        });

        res.status(201).json({
            success: true,
            message: 'Horario creado y asignado correctamente',
            data: {
                ...horarioResult.rows[0],
                empleado_id
            }
        });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error en createHorario:', error);
        res.status(500).json({
            success: false,
            message: 'Error al crear horario'
        });
    } finally {
        client.release();
    }
}

/**
 * PUT /api/horarios/:id
 * Actualiza un horario existente
 */
export async function updateHorario(req, res) {
    const client = await pool.connect();

    try {
        const { id } = req.params;
        const {
            empleado_id,
            fecha_inicio,
            fecha_fin,
            configuracion,
            es_activo
        } = req.body;

        await client.query('BEGIN');

        const configJson = configuracion ? JSON.stringify(configuracion) : null;

        const resultado = await client.query(`
            UPDATE horarios SET
                fecha_inicio = COALESCE($1, fecha_inicio),
                fecha_fin = $2,
                configuracion = COALESCE($3, configuracion),
                es_activo = COALESCE($4, es_activo)
            WHERE id = $5
            RETURNING *
        `, [fecha_inicio, fecha_fin, configJson, es_activo, id]);

        if (resultado.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({
                success: false,
                message: 'Horario no encontrado'
            });
        }

        // Si se proporciona empleado_id, actualizar la asignación
        if (empleado_id) {
            // Primero, quitar este horario de otros empleados
            await client.query(`
                UPDATE empleados 
                SET horario_id = NULL
                WHERE horario_id = $1
            `, [id]);

            // Asignar al nuevo empleado
            await client.query(`
                UPDATE empleados 
                SET horario_id = $1
                WHERE id = $2
            `, [id, empleado_id]);
        }

        await client.query('COMMIT');

        // Registrar evento
        await registrarEvento({
            titulo: 'Horario actualizado',
            descripcion: `Se actualizó el horario ${id}`,
            tipo_evento: TIPOS_EVENTO.HORARIO,
            prioridad: PRIORIDADES.BAJA,
            empleado_id: empleado_id,
            usuario_modificador_id: req.usuario?.id,
            detalles: { horario_id: id, cambios: req.body }
        });

        res.json({
            success: true,
            message: 'Horario actualizado correctamente',
            data: {
                ...resultado.rows[0],
                empleado_id
            }
        });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error en updateHorario:', error);
        res.status(500).json({
            success: false,
            message: 'Error al actualizar horario'
        });
    } finally {
        client.release();
    }
}

/**
 * DELETE /api/horarios/:id
 * Desactiva un horario (soft delete)
 */
export async function deleteHorario(req, res) {
    const client = await pool.connect();

    try {
        const { id } = req.params;

        await client.query('BEGIN');

        // Verificar si tiene empleados asignados
        const empleados = await client.query(
            'SELECT COUNT(*) FROM empleados WHERE horario_id = $1',
            [id]
        );

        // Si tiene empleados, quitar la asignación
        if (parseInt(empleados.rows[0].count) > 0) {
            await client.query(
                'UPDATE empleados SET horario_id = NULL WHERE horario_id = $1',
                [id]
            );
        }

        // Desactivar el horario
        const resultado = await client.query(`
            UPDATE horarios SET es_activo = false
            WHERE id = $1
            RETURNING id
        `, [id]);

        if (resultado.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({
                success: false,
                message: 'Horario no encontrado'
            });
        }

        await client.query('COMMIT');

        // Registrar evento
        await registrarEvento({
            titulo: 'Horario desactivado',
            descripcion: `Se desactivó el horario ${id}`,
            tipo_evento: TIPOS_EVENTO.HORARIO,
            prioridad: PRIORIDADES.ALTA,
            usuario_modificador_id: req.usuario?.id,
            detalles: { horario_id: id }
        });

        res.json({
            success: true,
            message: 'Horario desactivado correctamente'
        });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error en deleteHorario:', error);
        res.status(500).json({
            success: false,
            message: 'Error al eliminar horario'
        });
    } finally {
        client.release();
    }
}

/**
 * PATCH /api/horarios/:id/reactivar
 * Reactiva un horario desactivado (soft delete inverso)
 */
export async function reactivarHorario(req, res) {
    try {
        const { id } = req.params;

        const resultado = await pool.query(`
            UPDATE horarios SET es_activo = true
            WHERE id = $1 AND es_activo = false
            RETURNING id
        `, [id]);

        if (resultado.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Horario no encontrado o ya está activo'
            });
        }

        await registrarEvento({
            titulo: 'Horario reactivado',
            descripcion: `Se reactivó el horario ${id}`,
            tipo_evento: TIPOS_EVENTO.HORARIO,
            prioridad: PRIORIDADES.MEDIA,
            usuario_modificador_id: req.usuario?.id,
            detalles: { horario_id: id }
        });

        res.json({
            success: true,
            message: 'Horario reactivado correctamente'
        });

    } catch (error) {
        console.error('Error en reactivarHorario:', error);
        res.status(500).json({
            success: false,
            message: 'Error al reactivar horario'
        });
    }
}

/**
 * POST /api/horarios/:id/asignar
 * Asigna un horario a uno o varios empleados
 */
export async function asignarHorario(req, res) {
    const client = await pool.connect();

    try {
        const { id } = req.params;
        const { empleados_ids } = req.body;

        if (!empleados_ids || !Array.isArray(empleados_ids)) {
            return res.status(400).json({
                success: false,
                message: 'empleados_ids debe ser un array'
            });
        }

        await client.query('BEGIN');

        // Verificar que el horario existe
        const horario = await client.query('SELECT id FROM horarios WHERE id = $1', [id]);
        if (horario.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({
                success: false,
                message: 'Horario no encontrado'
            });
        }

        // Asignar a cada empleado
        const actualizados = await client.query(`
            UPDATE empleados SET horario_id = $1
            WHERE id = ANY($2)
            RETURNING id
        `, [id, empleados_ids]);

        await client.query('COMMIT');

        // Registrar evento
        await registrarEvento({
            titulo: 'Horario asignado',
            descripcion: `Se asignó el horario ${id} a ${actualizados.rowCount} empleado(s)`,
            tipo_evento: TIPOS_EVENTO.HORARIO,
            prioridad: PRIORIDADES.MEDIA,
            usuario_modificador_id: req.usuario?.id,
            detalles: { horario_id: id, empleados_ids }
        });

        res.json({
            success: true,
            message: `Horario asignado a ${actualizados.rowCount} empleado(s)`
        });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error en asignarHorario:', error);
        res.status(500).json({
            success: false,
            message: 'Error al asignar horario'
        });
    } finally {
        client.release();
    }
}

/**
 * GET /api/horarios/empleado/:empleadoId
 * Obtiene el horario actual de un empleado
 */
export async function getHorarioByEmpleado(req, res) {
    try {
        const { empleadoId } = req.params;

        const resultado = await pool.query(`
            SELECT
                h.id,
                h.fecha_inicio,
                h.fecha_fin,
                h.configuracion,
                h.es_activo
            FROM horarios h
            INNER JOIN empleados e ON e.horario_id = h.id
            WHERE e.id = $1 AND h.es_activo = true
        `, [empleadoId]);

        if (resultado.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'El empleado no tiene horario asignado'
            });
        }

        res.json({
            success: true,
            data: resultado.rows[0]
        });

    } catch (error) {
        console.error('Error en getHorarioByEmpleado:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener horario del empleado'
        });
    }
}