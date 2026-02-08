import { pool } from '../config/db.js';
import { generateId, generateToken, ID_PREFIXES } from '../utils/idGenerator.js';
import { registrarEvento, TIPOS_EVENTO, PRIORIDADES } from '../utils/eventos.js';
import { addClient, broadcast } from '../utils/sse.js';

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
            tipo,
            nombre,
            descripcion,
            correo,
            ip,
            mac,
            sistema_operativo,
            empresa_id,
            observaciones,
            dispositivos_temp
        } = req.body;

        // Normalizar IP y MAC (si vienen como array, convertir a string)
        const ipString = Array.isArray(ip) ? ip.join(', ') : ip;
        const macString = Array.isArray(mac) ? mac.join(', ') : mac;

        if (!tipo || !nombre) {
            return res.status(400).json({
                success: false,
                message: 'tipo y nombre son requeridos'
            });
        }

        if (macString) {
            const existente = await pool.query(
                "SELECT id FROM solicitudes WHERE mac = $1 AND estado = 'pendiente'",
                [macString]
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
                sistema_operativo, estado, token, empresa_id, observaciones, dispositivos_temp
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pendiente', $9, $10, $11, $12)
            RETURNING *
        `, [id, tipo, nombre, descripcion, correo, ipString, macString, sistema_operativo, token, empresa_id, observaciones, dispositivos_temp ? JSON.stringify(dispositivos_temp) : null]);

        // Registrar evento
        await registrarEvento({
            titulo: `Nueva solicitud de ${tipo}`,
            descripcion: `Se recibió solicitud de registro: ${nombre}`,
            tipo_evento: TIPOS_EVENTO.SOLICITUD,
            prioridad: PRIORIDADES.MEDIA,
            detalles: { solicitud_id: id, tipo, nombre, ip, mac }
        });

        // Notificar a clientes SSE
        broadcast('nueva-solicitud', {
            id: resultado.rows[0].id,
            tipo,
            nombre,
            estado: 'pendiente'
        });

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
        const { empleado_id } = req.body;

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

        let dispositivo_id;
        let biometricos_ids = [];

        if (sol.tipo === 'escritorio') {
            dispositivo_id = await generateId(ID_PREFIXES.ESCRITORIO);

            // Procesar dispositivos_temp si existen
            const dispositivos_temp = sol.dispositivos_temp || [];

            // Generar IDs de biométricos
            for (const dispositivo of dispositivos_temp) {
                const biometrico_id = await generateId(ID_PREFIXES.BIOMETRICO);
                biometricos_ids.push({
                    id: biometrico_id,
                    ...dispositivo
                });
            }

            // 1. Crear el escritorio con los IDs de biométricos
            await client.query(`
                INSERT INTO escritorio (id, nombre, descripcion, ip, mac, sistema_operativo, dispositivos_biometricos, es_activo)
                VALUES ($1, $2, $3, $4, $5, $6, $7, true)
            `, [
                dispositivo_id,
                sol.nombre,
                sol.descripcion,
                sol.ip,
                sol.mac,
                sol.sistema_operativo,
                biometricos_ids.length > 0 ? JSON.stringify(biometricos_ids.map(b => b.id)) : null
            ]);

            // 2. Crear registros biométricos (ahora el escritorio ya existe)
            for (const dispositivo of biometricos_ids) {
                await client.query(`
                    INSERT INTO biometrico (id, nombre, descripcion, tipo, ip, puerto, estado, es_activo, escritorio_id)
                    VALUES ($1, $2, $3, $4, $5, $6, 'desconectado', true, $7)
                `, [
                    dispositivo.id,
                    dispositivo.nombre,
                    dispositivo.descripcion || null,
                    dispositivo.tipo,
                    dispositivo.ip || null,
                    dispositivo.puerto || null,
                    dispositivo_id
                ]);
            }

            // Extraer solo los IDs para la respuesta
            biometricos_ids = biometricos_ids.map(b => b.id);

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
                INSERT INTO movil (id, sistema_operativo, es_root, es_activo, empleado_id, ip, mac)
                VALUES ($1, $2, false, true, $3, $4, $5)
            `, [dispositivo_id, sol.sistema_operativo, empleado_id, sol.ip, sol.mac]);
        }

        await client.query(`
            UPDATE solicitudes SET
                estado = 'aceptado',
                fecha_respuesta = CURRENT_TIMESTAMP
            WHERE id = $1
        `, [id]);

        await client.query('COMMIT');

        // Registrar evento
        await registrarEvento({
            titulo: `Solicitud de ${sol.tipo} aceptada`,
            descripcion: `Dispositivo ${sol.nombre} registrado como ${dispositivo_id}`,
            tipo_evento: TIPOS_EVENTO.DISPOSITIVO,
            prioridad: PRIORIDADES.BAJA,
            detalles: {
                solicitud_id: id,
                dispositivo_id,
                tipo: sol.tipo,
                biometricos_ids: biometricos_ids.length > 0 ? biometricos_ids : undefined
            }
        });

        const responseData = {
            solicitud_id: id,
            dispositivo_id,
            tipo: sol.tipo
        };

        // Incluir IDs de biométricos si se crearon
        if (biometricos_ids.length > 0) {
            responseData.biometricos_ids = biometricos_ids;
        }

        // Notificar a clientes SSE
        broadcast('solicitud-actualizada', { id, estado: 'aceptado', tipo: sol.tipo });

        res.json({
            success: true,
            message: 'Solicitud aceptada. Dispositivo creado.',
            data: responseData
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

        const sol = resultado.rows[0];

        // Registrar evento
        await registrarEvento({
            titulo: `Solicitud de ${sol.tipo} rechazada`,
            descripcion: `Solicitud ${sol.nombre} rechazada: ${observaciones}`,
            tipo_evento: TIPOS_EVENTO.SOLICITUD,
            prioridad: PRIORIDADES.MEDIA,
            detalles: { solicitud_id: id, tipo: sol.tipo, motivo: observaciones }
        });

        // Notificar a clientes SSE
        broadcast('solicitud-actualizada', { id, estado: 'rechazado', tipo: sol.tipo });

        res.json({
            success: true,
            message: 'Solicitud rechazada',
            data: sol
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
            SELECT id, tipo, estado, fecha_respuesta, observaciones, mac
            FROM solicitudes
            WHERE token = $1
        `, [token]);

        if (resultado.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Token no válido'
            });
        }

        const solicitud = resultado.rows[0];
        const responseData = {
            id: solicitud.id,
            tipo: solicitud.tipo,
            estado: solicitud.estado,
            fecha_respuesta: solicitud.fecha_respuesta,
            observaciones: solicitud.observaciones
        };

        // Si está aceptada y es tipo escritorio, buscar el escritorio_id por MAC
        if (solicitud.estado === 'aceptado' && solicitud.tipo === 'escritorio' && solicitud.mac) {
            const escritorio = await pool.query(
                'SELECT id FROM escritorio WHERE mac = $1',
                [solicitud.mac]
            );
            if (escritorio.rows.length > 0) {
                responseData.escritorio_id = escritorio.rows[0].id;
            }
        }

        res.json({
            success: true,
            data: responseData
        });

    } catch (error) {
        console.error('Error en verificarSolicitud:', error);
        res.status(500).json({
            success: false,
            message: 'Error al verificar solicitud'
        });
    }
}

/**
 * PATCH /api/solicitudes/:id/pendiente
 * Actualiza el estado de una solicitud a 'pendiente'
 * Útil para reabrir solicitudes rechazadas o procesadas
 */
export async function actualizarAPendiente(req, res) {
    try {
        const { id } = req.params;
        const { observaciones } = req.body;

        // Verificar que la solicitud existe
        const solicitudExistente = await pool.query(
            "SELECT * FROM solicitudes WHERE id = $1",
            [id]
        );

        if (solicitudExistente.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Solicitud no encontrada'
            });
        }

        const estadoActual = solicitudExistente.rows[0].estado;

        // Verificar que no esté ya pendiente
        if (estadoActual === 'pendiente') {
            return res.status(400).json({
                success: false,
                message: 'La solicitud ya está en estado pendiente'
            });
        }

        // Actualizar a pendiente
        const resultado = await pool.query(`
            UPDATE solicitudes SET
                estado = 'pendiente',
                fecha_respuesta = NULL,
                observaciones = $1
            WHERE id = $2
            RETURNING *
        `, [observaciones || null, id]);

        res.json({
            success: true,
            message: 'Solicitud actualizada a pendiente',
            data: resultado.rows[0]
        });

    } catch (error) {
        console.error('Error en actualizarAPendiente:', error);
        res.status(500).json({
            success: false,
            message: 'Error al actualizar solicitud a pendiente'
        });
    }
}

/**
 * GET /api/solicitudes/stream
 * SSE endpoint para notificaciones en tiempo real de solicitudes
 * Usa token por query param porque EventSource no soporta headers
 */
export async function streamSolicitudes(req, res) {
    const { token } = req.query;

    if (!token) {
        return res.status(401).json({ success: false, message: 'Token requerido' });
    }

    // Verificar que el token (usuario_id) sea válido
    try {
        const resultado = await pool.query(
            "SELECT id FROM usuarios WHERE id = $1 AND estado_cuenta = 'activo'",
            [token]
        );

        if (resultado.rows.length === 0) {
            return res.status(401).json({ success: false, message: 'Token inválido' });
        }
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Error de autenticación' });
    }

    addClient(res);
}