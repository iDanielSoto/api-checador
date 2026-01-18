import { pool } from '../config/db.js';
import { generateId, generateToken, ID_PREFIXES } from '../utils/idGenerator.js';

/**
 * GET /api/solicitudes
 * Obtiene todas las solicitudes de dispositivos
 */
export async function getSolicitudes(req, res) {
    try {
        const { tipo, estado, empresa_id, limit = 50, offset = 0 } = req.query;

        let query = `
            SELECT
                s.id,
                s.tipo,
                s.nombre,
                s.descripcion,
                s.correo,
                s.ip,
                s.mac,
                s.sistema_operativo,
                s.estado,
                s.fecha_registro,
                s.fecha_respuesta,
                s.observaciones,
                s.empresa_id,
                e.nombre as empresa_nombre
            FROM solicitudes s
            LEFT JOIN empresas e ON e.id = s.empresa_id
            WHERE 1=1
        `;
        const params = [];
        let paramIndex = 1;

        if (tipo) {
            query += ` AND s.tipo = $${paramIndex++}`;
            params.push(tipo);
        }

        if (estado) {
            query += ` AND s.estado = $${paramIndex++}`;
            params.push(estado);
        }

        if (empresa_id) {
            query += ` AND s.empresa_id = $${paramIndex++}`;
            params.push(empresa_id);
        }

        query += ` ORDER BY s.fecha_registro DESC LIMIT $${paramIndex++} OFFSET $${paramIndex}`;
        params.push(parseInt(limit), parseInt(offset));

        const resultado = await pool.query(query, params);

        res.json({
            success: true,
            data: resultado.rows
        });

    } catch (error) {
        console.error('Error en getSolicitudes:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener solicitudes'
        });
    }
}

/**
 * GET /api/solicitudes/pendientes
 * Obtiene solicitudes pendientes de aprobar
 */
export async function getSolicitudesPendientes(req, res) {
    try {
        const resultado = await pool.query(`
            SELECT
                s.*,
                e.nombre as empresa_nombre
            FROM solicitudes s
            LEFT JOIN empresas e ON e.id = s.empresa_id
            WHERE s.estado = 'pendiente'
            ORDER BY s.fecha_registro ASC
        `);

        res.json({
            success: true,
            data: resultado.rows,
            total: resultado.rows.length
        });

    } catch (error) {
        console.error('Error en getSolicitudesPendientes:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener solicitudes pendientes'
        });
    }
}

/**
 * GET /api/solicitudes/:id
 * Obtiene una solicitud por ID
 */
export async function getSolicitudById(req, res) {
    try {
        const { id } = req.params;

        const resultado = await pool.query(`
            SELECT
                s.*,
                e.nombre as empresa_nombre
            FROM solicitudes s
            LEFT JOIN empresas e ON e.id = s.empresa_id
            WHERE s.id = $1
        `, [id]);

        if (resultado.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Solicitud no encontrada'
            });
        }

        res.json({
            success: true,
            data: resultado.rows[0]
        });

    } catch (error) {
        console.error('Error en getSolicitudById:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener solicitud'
        });
    }
}

/**
 * POST /api/solicitudes
 * Crea una nueva solicitud de dispositivo (desde el dispositivo)
 */
export async function createSolicitud(req, res) {
    try {
        const {
            tipo,           // 'movil' o 'escritorio'
            nombre,
            descripcion,
            correo,
            ip,
            mac,
            sistema_operativo,
            empresa_id
        } = req.body;

        if (!tipo || !nombre) {
            return res.status(400).json({
                success: false,
                message: 'tipo y nombre son requeridos'
            });
        }

        // Verificar si ya existe una solicitud pendiente con la misma MAC
        if (mac) {
            const existente = await pool.query(
                "SELECT id FROM solicitudes WHERE mac = $1 AND estado = 'pendiente'",
                [mac]
            );
            if (existente.rows.length > 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Ya existe una solicitud pendiente para este dispositivo'
                });
            }
        }

        const id = await generateId(ID_PREFIXES.SOLICITUD);
        const token = generateToken();

        const resultado = await pool.query(`
            INSERT INTO solicitudes (
                id, tipo, nombre, descripcion, correo, ip, mac,
                sistema_operativo, estado, token, empresa_id
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pendiente', $9, $10)
            RETURNING *
        `, [id, tipo, nombre, descripcion, correo, ip, mac, sistema_operativo, token, empresa_id]);

        res.status(201).json({
            success: true,
            message: 'Solicitud creada correctamente. Espere aprobación.',
            data: {
                id: resultado.rows[0].id,
                token: resultado.rows[0].token,
                estado: resultado.rows[0].estado
            }
        });

    } catch (error) {
        console.error('Error en createSolicitud:', error);
        res.status(500).json({
            success: false,
            message: 'Error al crear solicitud'
        });
    }
}

/**
 * PATCH /api/solicitudes/:id/aceptar
 * Acepta una solicitud y crea el dispositivo correspondiente
 */
export async function aceptarSolicitud(req, res) {
    const client = await pool.connect();

    try {
        const { id } = req.params;
        const { empleado_id } = req.body;  // Solo para móviles

        // Obtener solicitud
        const solicitud = await client.query(
            "SELECT * FROM solicitudes WHERE id = $1 AND estado = 'pendiente'",
            [id]
        );

        if (solicitud.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Solicitud no encontrada o ya procesada'
            });
        }

        const sol = solicitud.rows[0];

        await client.query('BEGIN');

        // Crear dispositivo según el tipo
        let dispositivo_id;

        if (sol.tipo === 'escritorio') {
            dispositivo_id = await generateId(ID_PREFIXES.ESCRITORIO);
            await client.query(`
                INSERT INTO escritorio (id, nombre, descripcion, ip, mac, sistema_operativo, es_activo)
                VALUES ($1, $2, $3, $4, $5, $6, true)
            `, [dispositivo_id, sol.nombre, sol.descripcion, sol.ip, sol.mac, sol.sistema_operativo]);

        } else if (sol.tipo === 'movil') {
            if (!empleado_id) {
                await client.query('ROLLBACK');
                return res.status(400).json({
                    success: false,
                    message: 'empleado_id es requerido para dispositivos móviles'
                });
            }

            dispositivo_id = await generateId(ID_PREFIXES.MOVIL);
            await client.query(`
                INSERT INTO movil (id, sistema_operativo, es_root, es_activo, empleado_id)
                VALUES ($1, $2, false, true, $3)
            `, [dispositivo_id, sol.sistema_operativo, empleado_id]);
        }

        // Actualizar solicitud
        await client.query(`
            UPDATE solicitudes SET
                estado = 'aceptado',
                fecha_respuesta = CURRENT_TIMESTAMP
            WHERE id = $1
        `, [id]);

        await client.query('COMMIT');

        res.json({
            success: true,
            message: 'Solicitud aceptada. Dispositivo creado.',
            data: {
                solicitud_id: id,
                dispositivo_id,
                tipo: sol.tipo
            }
        });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error en aceptarSolicitud:', error);
        res.status(500).json({
            success: false,
            message: 'Error al aceptar solicitud'
        });
    } finally {
        client.release();
    }
}

/**
 * PATCH /api/solicitudes/:id/rechazar
 * Rechaza una solicitud
 */
export async function rechazarSolicitud(req, res) {
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
            UPDATE solicitudes SET
                estado = 'rechazado',
                fecha_respuesta = CURRENT_TIMESTAMP,
                observaciones = $1
            WHERE id = $2 AND estado = 'pendiente'
            RETURNING *
        `, [observaciones, id]);

        if (resultado.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Solicitud no encontrada o ya procesada'
            });
        }

        res.json({
            success: true,
            message: 'Solicitud rechazada',
            data: resultado.rows[0]
        });

    } catch (error) {
        console.error('Error en rechazarSolicitud:', error);
        res.status(500).json({
            success: false,
            message: 'Error al rechazar solicitud'
        });
    }
}

/**
 * GET /api/solicitudes/verificar/:token
 * Verifica el estado de una solicitud por token (para el dispositivo)
 */
export async function verificarSolicitud(req, res) {
    try {
        const { token } = req.params;

        const resultado = await pool.query(`
            SELECT id, tipo, estado, fecha_respuesta, observaciones
            FROM solicitudes
            WHERE token = $1
        `, [token]);

        if (resultado.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Token no válido'
            });
        }

        res.json({
            success: true,
            data: resultado.rows[0]
        });

    } catch (error) {
        console.error('Error en verificarSolicitud:', error);
        res.status(500).json({
            success: false,
            message: 'Error al verificar solicitud'
        });
    }
}
