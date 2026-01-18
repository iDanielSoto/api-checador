import { pool } from '../config/db.js';
import { generateId, ID_PREFIXES } from '../utils/idGenerator.js';

/**
 * GET /api/biometrico
 * Obtiene todos los lectores biométricos
 */
export async function getBiometricos(req, res) {
    try {
        const { tipo, estado, escritorio_id, es_activo } = req.query;

        let query = `
            SELECT
                b.id,
                b.nombre,
                b.descripcion,
                b.tipo,
                b.puerto,
                b.ip,
                b.estado,
                b.es_activo,
                b.escritorio_id,
                e.nombre as escritorio_nombre
            FROM biometrico b
            LEFT JOIN escritorio e ON e.id = b.escritorio_id
            WHERE 1=1
        `;
        const params = [];
        let paramIndex = 1;

        if (tipo) {
            query += ` AND b.tipo = $${paramIndex++}`;
            params.push(tipo);
        }

        if (estado) {
            query += ` AND b.estado = $${paramIndex++}`;
            params.push(estado);
        }

        if (escritorio_id) {
            query += ` AND b.escritorio_id = $${paramIndex++}`;
            params.push(escritorio_id);
        }

        if (es_activo !== undefined) {
            query += ` AND b.es_activo = $${paramIndex++}`;
            params.push(es_activo === 'true');
        }

        query += ` ORDER BY b.nombre ASC`;

        const resultado = await pool.query(query, params);

        res.json({
            success: true,
            data: resultado.rows
        });

    } catch (error) {
        console.error('Error en getBiometricos:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener lectores biométricos'
        });
    }
}

/**
 * GET /api/biometrico/:id
 * Obtiene un lector biométrico por ID
 */
export async function getBiometricoById(req, res) {
    try {
        const { id } = req.params;

        const resultado = await pool.query(`
            SELECT
                b.*,
                e.nombre as escritorio_nombre
            FROM biometrico b
            LEFT JOIN escritorio e ON e.id = b.escritorio_id
            WHERE b.id = $1
        `, [id]);

        if (resultado.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Lector biométrico no encontrado'
            });
        }

        res.json({
            success: true,
            data: resultado.rows[0]
        });

    } catch (error) {
        console.error('Error en getBiometricoById:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener lector biométrico'
        });
    }
}

/**
 * POST /api/biometrico
 * Registra un nuevo lector biométrico
 */
export async function createBiometrico(req, res) {
    try {
        const {
            nombre,
            descripcion,
            tipo,        // 'facial' o 'dactilar'
            puerto,
            ip,
            escritorio_id
        } = req.body;

        if (!nombre || !tipo) {
            return res.status(400).json({
                success: false,
                message: 'nombre y tipo son requeridos'
            });
        }

        const id = await generateId(ID_PREFIXES.BIOMETRICO);

        const resultado = await pool.query(`
            INSERT INTO biometrico (id, nombre, descripcion, tipo, puerto, ip, estado, es_activo, escritorio_id)
            VALUES ($1, $2, $3, $4, $5, $6, 'desconectado', true, $7)
            RETURNING *
        `, [id, nombre, descripcion, tipo, puerto, ip, escritorio_id]);

        res.status(201).json({
            success: true,
            message: 'Lector biométrico registrado correctamente',
            data: resultado.rows[0]
        });

    } catch (error) {
        console.error('Error en createBiometrico:', error);
        res.status(500).json({
            success: false,
            message: 'Error al registrar lector biométrico'
        });
    }
}

/**
 * PUT /api/biometrico/:id
 * Actualiza un lector biométrico
 */
export async function updateBiometrico(req, res) {
    try {
        const { id } = req.params;
        const {
            nombre,
            descripcion,
            tipo,
            puerto,
            ip,
            estado,
            es_activo,
            escritorio_id
        } = req.body;

        const resultado = await pool.query(`
            UPDATE biometrico SET
                nombre = COALESCE($1, nombre),
                descripcion = COALESCE($2, descripcion),
                tipo = COALESCE($3, tipo),
                puerto = COALESCE($4, puerto),
                ip = COALESCE($5, ip),
                estado = COALESCE($6, estado),
                es_activo = COALESCE($7, es_activo),
                escritorio_id = COALESCE($8, escritorio_id)
            WHERE id = $9
            RETURNING *
        `, [nombre, descripcion, tipo, puerto, ip, estado, es_activo, escritorio_id, id]);

        if (resultado.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Lector biométrico no encontrado'
            });
        }

        res.json({
            success: true,
            message: 'Lector biométrico actualizado correctamente',
            data: resultado.rows[0]
        });

    } catch (error) {
        console.error('Error en updateBiometrico:', error);
        res.status(500).json({
            success: false,
            message: 'Error al actualizar lector biométrico'
        });
    }
}

/**
 * PATCH /api/biometrico/:id/estado
 * Actualiza el estado de conexión de un lector
 */
export async function updateEstadoBiometrico(req, res) {
    try {
        const { id } = req.params;
        const { estado } = req.body;  // 'conectado', 'desconectado', 'error'

        if (!estado) {
            return res.status(400).json({
                success: false,
                message: 'estado es requerido'
            });
        }

        const resultado = await pool.query(`
            UPDATE biometrico SET estado = $1
            WHERE id = $2
            RETURNING id, nombre, estado
        `, [estado, id]);

        if (resultado.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Lector biométrico no encontrado'
            });
        }

        res.json({
            success: true,
            message: 'Estado actualizado',
            data: resultado.rows[0]
        });

    } catch (error) {
        console.error('Error en updateEstadoBiometrico:', error);
        res.status(500).json({
            success: false,
            message: 'Error al actualizar estado'
        });
    }
}

/**
 * DELETE /api/biometrico/:id
 * Desactiva un lector biométrico
 */
export async function deleteBiometrico(req, res) {
    try {
        const { id } = req.params;

        const resultado = await pool.query(`
            UPDATE biometrico SET es_activo = false
            WHERE id = $1 AND es_activo = true
            RETURNING id
        `, [id]);

        if (resultado.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Lector no encontrado o ya desactivado'
            });
        }

        res.json({
            success: true,
            message: 'Lector biométrico desactivado correctamente'
        });

    } catch (error) {
        console.error('Error en deleteBiometrico:', error);
        res.status(500).json({
            success: false,
            message: 'Error al desactivar lector'
        });
    }
}

/**
 * GET /api/biometrico/stats
 * Obtiene estadísticas de lectores biométricos
 */
export async function getStatsBiometrico(req, res) {
    try {
        const resultado = await pool.query(`
            SELECT
                COUNT(*) as total,
                COUNT(*) FILTER (WHERE estado = 'conectado') as conectados,
                COUNT(*) FILTER (WHERE estado = 'desconectado') as desconectados,
                COUNT(*) FILTER (WHERE estado = 'error') as con_error,
                COUNT(*) FILTER (WHERE tipo = 'facial') as faciales,
                COUNT(*) FILTER (WHERE tipo = 'dactilar') as dactilares
            FROM biometrico
            WHERE es_activo = true
        `);

        res.json({
            success: true,
            data: resultado.rows[0]
        });

    } catch (error) {
        console.error('Error en getStatsBiometrico:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener estadísticas'
        });
    }
}
