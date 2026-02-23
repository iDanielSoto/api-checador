import { pool } from '../config/db.js';
import { generateId, ID_PREFIXES } from '../utils/idGenerator.js';

/**
 * GET /api/eventos
 * Obtiene eventos con filtros
 */
export async function getEventos(req, res) {
    try {
        const {
            empleado_id,
            tipo_evento,
            prioridad,
            fecha_inicio,
            fecha_fin,
            limit = 50,
            offset = 0
        } = req.query;

        let query = `
            SELECT
                e.id,
                e.titulo,
                e.descripcion,
                e.tipo_evento,
                e.prioridad,
                e.detalles,
                e.fecha_registro,
                e.empleado_id,
                COALESCE(u.nombre, u_mod.nombre, u_tgt.nombre) as empleado_nombre
            FROM eventos e
            LEFT JOIN empleados emp ON emp.id = e.empleado_id
            LEFT JOIN usuarios u ON u.id = emp.usuario_id
            LEFT JOIN usuarios u_tgt ON u_tgt.id = (e.detalles->>'usuario_id')
            LEFT JOIN usuarios u_mod ON u_mod.id = (e.detalles->>'usuario_modificador_id')
            WHERE $1::varchar IN (u.empresa_id::varchar, u_tgt.empresa_id::varchar, u_mod.empresa_id::varchar, e.empresa_id::varchar, e.detalles->>'empresa_id')
        `;
        const params = [req.empresa_id];
        let paramIndex = 2;

        if (empleado_id) {
            query += ` AND e.empleado_id = $${paramIndex++}`;
            params.push(empleado_id);
        }

        if (tipo_evento) {
            query += ` AND e.tipo_evento = $${paramIndex++}`;
            params.push(tipo_evento);
        }

        if (prioridad) {
            query += ` AND e.prioridad = $${paramIndex++}`;
            params.push(prioridad);
        }

        if (fecha_inicio) {
            query += ` AND e.fecha_registro >= $${paramIndex++}`;
            params.push(fecha_inicio);
        }

        if (fecha_fin) {
            query += ` AND e.fecha_registro <= $${paramIndex++}`;
            params.push(fecha_fin);
        }

        query += ` ORDER BY e.fecha_registro DESC LIMIT $${paramIndex++} OFFSET $${paramIndex}`;
        params.push(parseInt(limit), parseInt(offset));

        const resultado = await pool.query(query, params);

        res.json({
            success: true,
            data: resultado.rows
        });

    } catch (error) {
        console.error('Error en getEventos:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener eventos'
        });
    }
}

/**
 * GET /api/eventos/:id
 * Obtiene un evento por ID
 */
export async function getEventoById(req, res) {
    try {
        const { id } = req.params;

        const resultado = await pool.query(`
            SELECT
                e.*,
                COALESCE(u.nombre, u_mod.nombre, u_tgt.nombre) as empleado_nombre
            FROM eventos e
            LEFT JOIN empleados emp ON emp.id = e.empleado_id
            LEFT JOIN usuarios u ON u.id = emp.usuario_id
            LEFT JOIN usuarios u_tgt ON u_tgt.id = (e.detalles->>'usuario_id')
            LEFT JOIN usuarios u_mod ON u_mod.id = (e.detalles->>'usuario_modificador_id')
            WHERE e.id = $1 AND $2::varchar IN (u.empresa_id::varchar, u_tgt.empresa_id::varchar, u_mod.empresa_id::varchar, e.empresa_id::varchar, e.detalles->>'empresa_id')
        `, [id, req.empresa_id]);

        if (resultado.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Evento no encontrado'
            });
        }

        res.json({
            success: true,
            data: resultado.rows[0]
        });

    } catch (error) {
        console.error('Error en getEventoById:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener evento'
        });
    }
}

/**
 * POST /api/eventos
 * Crea un nuevo evento
 */
export async function createEvento(req, res) {
    try {
        const {
            titulo,
            descripcion,
            tipo_evento,
            prioridad = 'media',
            detalles,
            empleado_id
        } = req.body;

        if (!titulo || !tipo_evento) {
            return res.status(400).json({
                success: false,
                message: 'titulo y tipo_evento son requeridos'
            });
        }

        const id = await generateId(ID_PREFIXES.EVENTO);

        const resultado = await pool.query(`
            INSERT INTO eventos (id, titulo, descripcion, tipo_evento, prioridad, detalles, empleado_id)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING *
        `, [id, titulo, descripcion, tipo_evento, prioridad, detalles ? JSON.stringify(detalles) : null, empleado_id]);

        res.status(201).json({
            success: true,
            message: 'Evento registrado correctamente',
            data: resultado.rows[0]
        });

    } catch (error) {
        console.error('Error en createEvento:', error);
        res.status(500).json({
            success: false,
            message: 'Error al crear evento'
        });
    }
}

/**
 * GET /api/eventos/recientes
 * Obtiene los eventos más recientes
 */
export async function getEventosRecientes(req, res) {
    try {
        const { limit = 20 } = req.query;

        const resultado = await pool.query(`
            SELECT
                e.id,
                e.titulo,
                e.tipo_evento,
                e.prioridad,
                e.fecha_registro,
                COALESCE(u.nombre, u_mod.nombre, u_tgt.nombre) as empleado_nombre
            FROM eventos e
            LEFT JOIN empleados emp ON emp.id = e.empleado_id
            LEFT JOIN usuarios u ON u.id = emp.usuario_id
            LEFT JOIN usuarios u_tgt ON u_tgt.id = (e.detalles->>'usuario_id')
            LEFT JOIN usuarios u_mod ON u_mod.id = (e.detalles->>'usuario_modificador_id')
            WHERE $1::varchar IN (u.empresa_id::varchar, u_tgt.empresa_id::varchar, u_mod.empresa_id::varchar, e.empresa_id::varchar, e.detalles->>'empresa_id')
            ORDER BY e.fecha_registro DESC
            LIMIT $2
        `, [req.empresa_id, parseInt(limit)]);

        res.json({
            success: true,
            data: resultado.rows
        });

    } catch (error) {
        console.error('Error en getEventosRecientes:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener eventos recientes'
        });
    }
}

/**
 * GET /api/eventos/stats
 * Estadísticas de eventos
 */
export async function getStatsEventos(req, res) {
    try {
        const { fecha_inicio, fecha_fin } = req.query;

        let whereClause = `WHERE $1::varchar IN (u.empresa_id::varchar, u_tgt.empresa_id::varchar, u_mod.empresa_id::varchar, e.empresa_id::varchar, e.detalles->>'empresa_id')`;
        const params = [req.empresa_id];
        let paramIndex = 2;

        if (fecha_inicio && fecha_fin) {
            whereClause += ` AND e.fecha_registro BETWEEN $${paramIndex++} AND $${paramIndex++}`;
            params.push(fecha_inicio, fecha_fin);
        }

        const baseJoins = `
            FROM eventos e
            LEFT JOIN empleados emp ON emp.id = e.empleado_id
            LEFT JOIN usuarios u ON u.id = emp.usuario_id
            LEFT JOIN usuarios u_tgt ON u_tgt.id = (e.detalles->>'usuario_id')
            LEFT JOIN usuarios u_mod ON u_mod.id = (e.detalles->>'usuario_modificador_id')
            ${whereClause}
        `;

        const resultado = await pool.query(`
            SELECT
                e.tipo_evento,
                COUNT(*) as total
            ${baseJoins}
            GROUP BY e.tipo_evento
            ORDER BY total DESC
        `, params);

        const porPrioridad = await pool.query(`
            SELECT
                e.prioridad,
                COUNT(*) as total
            ${baseJoins}
            GROUP BY e.prioridad
        `, params);

        res.json({
            success: true,
            data: {
                por_tipo: resultado.rows,
                por_prioridad: porPrioridad.rows
            }
        });

    } catch (error) {
        console.error('Error en getStatsEventos:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener estadísticas'
        });
    }
}
