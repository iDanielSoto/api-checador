import { pool } from '../config/db.js';
import { generateId, ID_PREFIXES } from '../utils/idGenerator.js';

/**
 * GET /api/incidencias
 * Obtiene incidencias con filtros
 */
export async function getIncidencias(req, res) {
    try {
        const {
            empleado_id,
            tipo,
            estado,
            fecha_inicio,
            fecha_fin,
            limit = 50,
            offset = 0
        } = req.query;

        let query = `
            SELECT
                i.id,
                i.motivo,
                i.tipo,
                i.observaciones,
                i.fecha_inicio,
                i.fecha_fin,
                i.estado,
                i.empleado_id,
                u.nombre as empleado_nombre,
                u.foto as empleado_foto
            FROM incidencias i
            INNER JOIN empleados e ON e.id = i.empleado_id
            INNER JOIN usuarios u ON u.id = e.usuario_id
            WHERE 1=1
        `;
        const params = [];
        let paramIndex = 1;

        if (empleado_id) {
            query += ` AND i.empleado_id = $${paramIndex++}`;
            params.push(empleado_id);
        }

        if (tipo) {
            query += ` AND i.tipo = $${paramIndex++}`;
            params.push(tipo);
        }

        if (estado) {
            query += ` AND i.estado = $${paramIndex++}`;
            params.push(estado);
        }

        if (fecha_inicio) {
            query += ` AND i.fecha_inicio >= $${paramIndex++}`;
            params.push(fecha_inicio);
        }

        if (fecha_fin) {
            query += ` AND i.fecha_fin <= $${paramIndex++}`;
            params.push(fecha_fin);
        }

        query += ` ORDER BY i.fecha_inicio DESC LIMIT $${paramIndex++} OFFSET $${paramIndex}`;
        params.push(parseInt(limit), parseInt(offset));

        const resultado = await pool.query(query, params);

        res.json({
            success: true,
            data: resultado.rows
        });

    } catch (error) {
        console.error('Error en getIncidencias:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener incidencias'
        });
    }
}

/**
 * GET /api/incidencias/:id
 * Obtiene una incidencia por ID
 */
export async function getIncidenciaById(req, res) {
    try {
        const { id } = req.params;

        const resultado = await pool.query(`
            SELECT
                i.*,
                u.nombre as empleado_nombre,
                u.correo as empleado_correo
            FROM incidencias i
            INNER JOIN empleados e ON e.id = i.empleado_id
            INNER JOIN usuarios u ON u.id = e.usuario_id
            WHERE i.id = $1
        `, [id]);

        if (resultado.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Incidencia no encontrada'
            });
        }

        res.json({
            success: true,
            data: resultado.rows[0]
        });

    } catch (error) {
        console.error('Error en getIncidenciaById:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener incidencia'
        });
    }
}

/**
 * POST /api/incidencias
 * Crea una nueva incidencia (justificante, permiso, vacaciones, etc.)
 */
export async function createIncidencia(req, res) {
    try {
        const {
            empleado_id,
            tipo,           // 'retardo', 'justificante', 'permiso', 'vacaciones', 'festivo'
            motivo,
            observaciones,
            fecha_inicio,
            fecha_fin
        } = req.body;

        if (!empleado_id || !tipo) {
            return res.status(400).json({
                success: false,
                message: 'empleado_id y tipo son requeridos'
            });
        }

        // Verificar empleado
        const empleado = await pool.query(`
            SELECT e.id, u.nombre FROM empleados e
            INNER JOIN usuarios u ON u.id = e.usuario_id
            WHERE e.id = $1
        `, [empleado_id]);

        if (empleado.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Empleado no encontrado'
            });
        }

        const id = await generateId(ID_PREFIXES.INCIDENCIA);

        const resultado = await pool.query(`
            INSERT INTO incidencias (id, empleado_id, tipo, motivo, observaciones, fecha_inicio, fecha_fin, estado)
            VALUES ($1, $2, $3, $4, $5, $6, $7, 'pendiente')
            RETURNING *
        `, [id, empleado_id, tipo, motivo, observaciones, fecha_inicio, fecha_fin]);

        // Registrar evento
        const eventoId = await generateId(ID_PREFIXES.EVENTO);
        await pool.query(`
            INSERT INTO eventos (id, titulo, descripcion, tipo_evento, prioridad, empleado_id, detalles)
            VALUES ($1, $2, $3, 'incidencia', 'media', $4, $5)
        `, [
            eventoId,
            `Nueva incidencia: ${tipo}`,
            `${empleado.rows[0].nombre} registró un(a) ${tipo}`,
            empleado_id,
            JSON.stringify({ incidencia_id: id, tipo })
        ]);

        res.status(201).json({
            success: true,
            message: 'Incidencia creada correctamente',
            data: resultado.rows[0]
        });

    } catch (error) {
        console.error('Error en createIncidencia:', error);
        res.status(500).json({
            success: false,
            message: 'Error al crear incidencia'
        });
    }
}

/**
 * PUT /api/incidencias/:id
 * Actualiza una incidencia
 */
export async function updateIncidencia(req, res) {
    try {
        const { id } = req.params;
        const {
            motivo,
            observaciones,
            fecha_inicio,
            fecha_fin
        } = req.body;

        const resultado = await pool.query(`
            UPDATE incidencias SET
                motivo = COALESCE($1, motivo),
                observaciones = COALESCE($2, observaciones),
                fecha_inicio = COALESCE($3, fecha_inicio),
                fecha_fin = COALESCE($4, fecha_fin)
            WHERE id = $5 AND estado = 'pendiente'
            RETURNING *
        `, [motivo, observaciones, fecha_inicio, fecha_fin, id]);

        if (resultado.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Incidencia no encontrada o ya fue procesada'
            });
        }

        res.json({
            success: true,
            message: 'Incidencia actualizada correctamente',
            data: resultado.rows[0]
        });

    } catch (error) {
        console.error('Error en updateIncidencia:', error);
        res.status(500).json({
            success: false,
            message: 'Error al actualizar incidencia'
        });
    }
}

/**
 * PATCH /api/incidencias/:id/aprobar
 * Aprueba una incidencia pendiente
 */
export async function aprobarIncidencia(req, res) {
    try {
        const { id } = req.params;
        const { observaciones } = req.body;

        const resultado = await pool.query(`
            UPDATE incidencias SET
                estado = 'aprobado',
                observaciones = COALESCE($1, observaciones)
            WHERE id = $2 AND estado = 'pendiente'
            RETURNING *
        `, [observaciones, id]);

        if (resultado.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Incidencia no encontrada o ya fue procesada'
            });
        }

        // Registrar evento
        const eventoId = await generateId(ID_PREFIXES.EVENTO);
        await pool.query(`
            INSERT INTO eventos (id, titulo, tipo_evento, prioridad, empleado_id, detalles)
            VALUES ($1, 'Incidencia aprobada', 'incidencia', 'baja', $2, $3)
        `, [
            eventoId,
            resultado.rows[0].empleado_id,
            JSON.stringify({ incidencia_id: id, aprobado_por: req.usuario.id })
        ]);

        res.json({
            success: true,
            message: 'Incidencia aprobada correctamente',
            data: resultado.rows[0]
        });

    } catch (error) {
        console.error('Error en aprobarIncidencia:', error);
        res.status(500).json({
            success: false,
            message: 'Error al aprobar incidencia'
        });
    }
}

/**
 * PATCH /api/incidencias/:id/rechazar
 * Rechaza una incidencia pendiente
 */
export async function rechazarIncidencia(req, res) {
    try {
        const { id } = req.params;
        const { observaciones } = req.body;

        if (!observaciones) {
            return res.status(400).json({
                success: false,
                message: 'Las observaciones son requeridas al rechazar'
            });
        }

        const resultado = await pool.query(`
            UPDATE incidencias SET
                estado = 'rechazado',
                observaciones = $1
            WHERE id = $2 AND estado = 'pendiente'
            RETURNING *
        `, [observaciones, id]);

        if (resultado.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Incidencia no encontrada o ya fue procesada'
            });
        }

        // Registrar evento
        const eventoId = await generateId(ID_PREFIXES.EVENTO);
        await pool.query(`
            INSERT INTO eventos (id, titulo, tipo_evento, prioridad, empleado_id, detalles)
            VALUES ($1, 'Incidencia rechazada', 'incidencia', 'media', $2, $3)
        `, [
            eventoId,
            resultado.rows[0].empleado_id,
            JSON.stringify({ incidencia_id: id, rechazado_por: req.usuario.id, motivo: observaciones })
        ]);

        res.json({
            success: true,
            message: 'Incidencia rechazada',
            data: resultado.rows[0]
        });

    } catch (error) {
        console.error('Error en rechazarIncidencia:', error);
        res.status(500).json({
            success: false,
            message: 'Error al rechazar incidencia'
        });
    }
}

/**
 * GET /api/incidencias/pendientes
 * Obtiene incidencias pendientes de aprobación
 */
export async function getIncidenciasPendientes(req, res) {
    try {
        const resultado = await pool.query(`
            SELECT
                i.*,
                u.nombre as empleado_nombre,
                u.foto as empleado_foto
            FROM incidencias i
            INNER JOIN empleados e ON e.id = i.empleado_id
            INNER JOIN usuarios u ON u.id = e.usuario_id
            WHERE i.estado = 'pendiente'
            ORDER BY i.fecha_inicio ASC
        `);

        res.json({
            success: true,
            data: resultado.rows,
            total: resultado.rows.length    
        });

    } catch (error) {
        console.error('Error en getIncidenciasPendientes:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener incidencias pendientes'
        });
    }
}
