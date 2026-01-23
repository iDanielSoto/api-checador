import { pool } from '../config/db.js';
import { generateId, ID_PREFIXES } from '../utils/idGenerator.js';

/**
 * GET /api/movil
 * Obtiene todos los dispositivos móviles
 */
export async function getMoviles(req, res) {
    try {
        const { empleado_id, es_activo } = req.query;

        let query = `
            SELECT
                m.id,
                m.sistema_operativo,
                m.es_root,
                m.es_activo,
                m.fecha_registro,
                m.empleado_id,
                m.ip,
                m.mac,
                u.nombre as empleado_nombre,
                u.correo as empleado_correo
            FROM movil m
            INNER JOIN empleados e ON e.id = m.empleado_id
            INNER JOIN usuarios u ON u.id = e.usuario_id
            WHERE 1=1
        `;
        const params = [];
        let paramIndex = 1;

        if (empleado_id) {
            query += ` AND m.empleado_id = $${paramIndex++}`;
            params.push(empleado_id);
        }

        if (es_activo !== undefined) {
            query += ` AND m.es_activo = $${paramIndex++}`;
            params.push(es_activo === 'true');
        }

        query += ` ORDER BY m.fecha_registro DESC`;

        const resultado = await pool.query(query, params);

        res.json({
            success: true,
            data: resultado.rows
        });

    } catch (error) {
        console.error('Error en getMoviles:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener dispositivos móviles'
        });
    }
}

/**
 * GET /api/movil/:id
 * Obtiene un dispositivo móvil por ID
 */
export async function getMovilById(req, res) {
    try {
        const { id } = req.params;

        const resultado = await pool.query(`
            SELECT
                m.*,
                u.nombre as empleado_nombre,
                u.correo as empleado_correo
            FROM movil m
            INNER JOIN empleados e ON e.id = m.empleado_id
            INNER JOIN usuarios u ON u.id = e.usuario_id
            WHERE m.id = $1
        `, [id]);

        if (resultado.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Dispositivo móvil no encontrado'
            });
        }

        res.json({
            success: true,
            data: resultado.rows[0]
        });

    } catch (error) {
        console.error('Error en getMovilById:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener dispositivo móvil'
        });
    }
}

/**
 * POST /api/movil
 * Registra un nuevo dispositivo móvil para un empleado
 */
export async function createMovil(req, res) {
    try {
        const {
            empleado_id,
            sistema_operativo,
            es_root = false,
            ip,
            mac
        } = req.body;

        if (!empleado_id) {
            return res.status(400).json({
                success: false,
                message: 'empleado_id es requerido'
            });
        }

        // Verificar que el empleado existe
        const empleado = await pool.query(
            'SELECT id FROM empleados WHERE id = $1',
            [empleado_id]
        );

        if (empleado.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Empleado no encontrado'
            });
        }

        // Verificar si ya tiene un dispositivo activo
        const existente = await pool.query(
            'SELECT id FROM movil WHERE empleado_id = $1 AND es_activo = true',
            [empleado_id]
        );

        if (existente.rows.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'El empleado ya tiene un dispositivo móvil activo'
            });
        }

        const id = await generateId(ID_PREFIXES.MOVIL);

        // Updated query to include ip and mac
        const resultado = await pool.query(`
            INSERT INTO movil (id, sistema_operativo, es_root, es_activo, empleado_id, ip, mac)
            VALUES ($1, $2, $3, true, $4, $5, $6)
            RETURNING *
        `, [id, sistema_operativo, es_root, empleado_id, ip || null, mac || null]);

        res.status(201).json({
            success: true,
            message: 'Dispositivo móvil registrado correctamente',
            data: resultado.rows[0]
        });

    } catch (error) {
        console.error('Error en createMovil:', error);
        res.status(500).json({
            success: false,
            message: 'Error al registrar dispositivo móvil'
        });
    }
}

/**
 * PUT /api/movil/:id
 * Actualiza un dispositivo móvil
 */
export async function updateMovil(req, res) {
    try {
        const { id } = req.params;
        const { sistema_operativo, es_root, es_activo, ip, mac } = req.body;

        const resultado = await pool.query(`
            UPDATE movil SET
                sistema_operativo = COALESCE($1, sistema_operativo),
                es_root = COALESCE($2, es_root),
                es_activo = COALESCE($3, es_activo),
                ip = COALESCE($4, ip),
                mac = COALESCE($5, mac)
            WHERE id = $6
            RETURNING *
        `, [sistema_operativo, es_root, es_activo, ip, mac, id]);

        if (resultado.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Dispositivo móvil no encontrado'
            });
        }

        res.json({
            success: true,
            message: 'Dispositivo móvil actualizado correctamente',
            data: resultado.rows[0]
        });

    } catch (error) {
        console.error('Error en updateMovil:', error);
        res.status(500).json({
            success: false,
            message: 'Error al actualizar dispositivo móvil'
        });
    }
}

/**
 * DELETE /api/movil/:id
 * Desactiva un dispositivo móvil
 */
export async function deleteMovil(req, res) {
    try {
        const { id } = req.params;

        const resultado = await pool.query(`
            UPDATE movil SET es_activo = false
            WHERE id = $1 AND es_activo = true
            RETURNING id
        `, [id]);

        if (resultado.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Dispositivo no encontrado o ya desactivado'
            });
        }

        res.json({
            success: true,
            message: 'Dispositivo móvil desactivado correctamente'
        });

    } catch (error) {
        console.error('Error en deleteMovil:', error);
        res.status(500).json({
            success: false,
            message: 'Error al desactivar dispositivo móvil'
        });
    }
}

/**
 * GET /api/movil/empleado/:empleadoId
 * Obtiene el dispositivo móvil de un empleado
 */
export async function getMovilEmpleado(req, res) {
    try {
        const { empleadoId } = req.params;

        const resultado = await pool.query(`
            SELECT * FROM movil
            WHERE empleado_id = $1 AND es_activo = true
        `, [empleadoId]);

        if (resultado.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'El empleado no tiene dispositivo móvil registrado'
            });
        }

        res.json({
            success: true,
            data: resultado.rows[0]
        });

    } catch (error) {
        console.error('Error en getMovilEmpleado:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener dispositivo del empleado'
        });
    }
}