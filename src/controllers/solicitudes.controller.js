import { pool } from '../config/db.js';
import jwt from 'jsonwebtoken';
import { generateId, generateToken, ID_PREFIXES } from '../utils/idGenerator.js';
import { registrarEvento, TIPOS_EVENTO, PRIORIDADES } from '../utils/eventos.js';
import { addClient, broadcast } from '../utils/sse.js';
import { ejecutarValidacionesRed } from '../utils/networkValidator.js';

/**
 * POST /api/solicitudes/validar-afiliacion
 * Endpoint público para validar afiliación móvil.
 * Valida que la empresa exista, esté activa y que la IP del dispositivo esté
 * dentro de un segmento de red permitido (si está configurado).
 */
export async function validarAfiliacion(req, res) {
    try {
        const { identificador, ip } = req.body;
        const fallbackIp = ip || req.ip;

        if (!identificador) {
            return res.status(400).json({
                success: false,
                message: 'El identificador de la empresa es requerido'
            });
        }

        // Buscar la empresa por identificador y cargar su configuración de red
        const resultado = await pool.query(`
            SELECT 
                e.id, 
                e.nombre, 
                e.es_activo,
                c.segmentos_red
            FROM empresas e
            LEFT JOIN configuraciones c ON c.id = e.configuracion_id
            WHERE e.identificador = $1
        `, [identificador]);

        if (resultado.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Empresa no encontrada'
            });
        }

        const empresa = resultado.rows[0];

        if (!empresa.es_activo) {
            return res.status(403).json({
                success: false,
                message: 'La empresa no está activa en el sistema'
            });
        }

        // Parsear segmentos_red si viene como string
        let segmentos_red = empresa.segmentos_red;
        if (typeof segmentos_red === 'string') {
            try { segmentos_red = JSON.parse(segmentos_red); } catch { segmentos_red = []; }
        }

        // Ejecutar validaciones de red
        const validacionRed = ejecutarValidacionesRed({
            ip: fallbackIp,
            segmentosRed: segmentos_red || []
        });

        res.json({
            success: true,
            data: {
                empresa: {
                    id: empresa.id,
                    nombre: empresa.nombre,
                    es_activo: empresa.es_activo
                },
                validacionRed
            }
        });

    } catch (error) {
        console.error('Error en validarAfiliacion:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor al validar afiliación'
        });
    }
}

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
            WHERE s.empresa_id = $1
        `;
        const params = [req.empresa_id];
        let paramIndex = 2;

        if (tipo) {
            query += ` AND s.tipo = $${paramIndex++}`;
            params.push(tipo);
        }

        if (estado) {
            query += ` AND s.estado = $${paramIndex++}`;
            params.push(estado);
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
            WHERE s.estado = 'pendiente' AND s.empresa_id = $1
            ORDER BY s.fecha_registro ASC
        `, [req.empresa_id]);

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
            WHERE s.id = $1 AND s.empresa_id = $2
        `, [id, req.empresa_id]);

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
            identificador, // Aceptar identificador slug
            observaciones,
            dispositivos_temp,
            installToken // Token mágico de pre-autorización
        } = req.body;

        const ipString = Array.isArray(ip) ? ip.join(', ') : ip;
        const macString = Array.isArray(mac) ? mac.join(', ') : mac;

        if (!tipo || !nombre) {
            return res.status(400).json({
                success: false,
                message: 'tipo y nombre son requeridos'
            });
        }

        let empresaIdFinal = empresa_id;

        // --- VALIDACIÓN DE TOKEN MÁGICO (OBLIGATORIO PARA ESCRITORIO) ---
        if (tipo === 'escritorio') {
            if (!installToken) {
                return res.status(401).json({
                    success: false,
                    message: 'Se requiere un token de instalación válido para registrar este dispositivo'
                });
            }

            try {
                const decoded = jwt.verify(installToken, process.env.JWT_SECRET || 'default_secret');
                if (decoded.empresa_id) {
                    empresaIdFinal = decoded.empresa_id;
                    console.log(`🔐 Solicitud autorizada vía Token Mágico para empresa: ${empresaIdFinal}`);
                } else {
                    throw new Error('Token no contiene empresa_id');
                }
            } catch (err) {
                console.error('❌ Error validando installToken:', err.message);
                return res.status(401).json({
                    success: false,
                    message: 'Token de instalación inválido o expirado'
                });
            }
        }

        // PRIORIDAD: Si viene identificador (slug) y no tenemos empresaIdFinal aún
        if (!empresaIdFinal && identificador) {
            const resEmp = await pool.query('SELECT id FROM empresas WHERE identificador = $1', [identificador]);
            if (resEmp.rows.length > 0) {
                empresaIdFinal = resEmp.rows[0].id;
            }
        }

        if (!empresaIdFinal || empresaIdFinal === 'EMA00000') {
            const empresaDefault = await pool.query('SELECT id FROM empresas LIMIT 1');
            if (empresaDefault.rows.length > 0) {
                empresaIdFinal = empresaDefault.rows[0].id;
            } else {
                return res.status(400).json({
                    success: false,
                    message: 'No hay empresas registradas en el sistema'
                });
            }
        } else {
            const empresaExiste = await pool.query('SELECT id FROM empresas WHERE id = $1', [empresaIdFinal]);
            if (empresaExiste.rows.length === 0) {
                const empresaDefault = await pool.query('SELECT id FROM empresas LIMIT 1');
                if (empresaDefault.rows.length > 0) {
                    empresaIdFinal = empresaDefault.rows[0].id;
                }
            }
        }

        // --- Validar segmentos de red ---
        // Obtener segmentos de red configurados para la empresa
        let fueraDeRed = false;
        let alertasRed = [];
        try {
            const cfgRes = await pool.query(`
                SELECT c.segmentos_red
                FROM configuraciones c
                INNER JOIN empresas e ON e.configuracion_id = c.id
                WHERE e.id = $1
            `, [empresaIdFinal]);

            const segmentosRed = cfgRes.rows[0]?.segmentos_red || [];

            const validacion = ejecutarValidacionesRed({
                ip: ipString,
                segmentosRed
            });

            fueraDeRed = validacion.fueraDeRed;
            alertasRed = validacion.alertas;

            if (fueraDeRed) {
                console.warn(`⚠️ [solicitudes] IP fuera de malla: ${ipString} | Empresa: ${empresaIdFinal}`);
            }
        } catch (netErr) {
            console.error('[solicitudes] Error al validar red (no crítico):', netErr.message);
        }

        let id;
        let token;

        if (macString) {
            // Buscar si ya existe una solicitud con esta MAC (sin importar su estado)
            const existente = await pool.query(
                "SELECT id FROM solicitudes WHERE mac = $1 ORDER BY fecha_registro DESC LIMIT 1",
                [macString]
            );

            if (existente.rows.length > 0) {
                // Actualizar la solicitud existente en lugar de duplicarla
                id = existente.rows[0].id;
                token = generateToken();

                await pool.query(`
                    UPDATE solicitudes SET
                        tipo = $1,
                        nombre = $2,
                        descripcion = $3,
                        correo = $4,
                        ip = $5,
                        sistema_operativo = $6,
                        estado = 'pendiente',
                        token = $7,
                        empresa_id = $8,
                        observaciones = $9,
                        dispositivos_temp = $10,
                        advertencia_red = $11,
                        fecha_registro = CURRENT_TIMESTAMP,
                        fecha_respuesta = NULL
                    WHERE id = $12
                `, [tipo, nombre, descripcion, correo, ipString, sistema_operativo, token, empresaIdFinal, observaciones, dispositivos_temp ? JSON.stringify(dispositivos_temp) : null, fueraDeRed, id]);
            }
        }

        if (!id) {
            // No existe, creamos una nueva
            id = await generateId(ID_PREFIXES.SOLICITUD);
            token = generateToken();

            await pool.query(`
                INSERT INTO solicitudes (
                    id, tipo, nombre, descripcion, correo, ip, mac,
                    sistema_operativo, estado, token, empresa_id, observaciones, dispositivos_temp, advertencia_red
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pendiente', $9, $10, $11, $12, $13)
            `, [id, tipo, nombre, descripcion, correo, ipString, macString, sistema_operativo, token, empresaIdFinal, observaciones, dispositivos_temp ? JSON.stringify(dispositivos_temp) : null, fueraDeRed]);
        }

        // Registrar evento (prioridad ALTA si IP fuera de malla)
        await registrarEvento({
            titulo: `Nueva solicitud de ${tipo}${fueraDeRed ? ' ⚠️ IP fuera de red' : ''}`,
            descripcion: `Se recibió solicitud de registro: ${nombre}`,
            tipo_evento: TIPOS_EVENTO.SOLICITUD,
            prioridad: fueraDeRed ? PRIORIDADES.ALTA : PRIORIDADES.MEDIA,
            detalles: { solicitud_id: id, tipo, nombre, ip: ipString, mac: macString, alertas_red: alertasRed }
        });

        // Notificar a clientes SSE
        broadcast('nueva-solicitud', {
            id,
            tipo,
            nombre,
            estado: 'pendiente'
        });

        res.status(201).json({
            success: true,
            message: 'Solicitud creada/actualizada correctamente. Espere aprobación.',
            data: { id, token, estado: 'pendiente', empresa_id: empresaIdFinal }
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
            const dispositivos_temp = sol.dispositivos_temp || [];

            // Buscar si ya existe un escritorio con esta MAC
            const escritorioExistente = await client.query(
                "SELECT id FROM escritorio WHERE mac = $1 LIMIT 1",
                [sol.mac]
            );

            if (escritorioExistente.rows.length > 0) {
                dispositivo_id = escritorioExistente.rows[0].id;
                // Marcamos todos como inactivos temporalmente para luego reactivar solo los que vengan en la solicitud
                await client.query(`UPDATE biometrico SET es_activo = false WHERE escritorio_id = $1`, [dispositivo_id]);
            } else {
                dispositivo_id = await generateId(ID_PREFIXES.ESCRITORIO);
                await client.query(`
                    INSERT INTO escritorio (id, nombre, descripcion, ip, mac, sistema_operativo, es_activo, empresa_id)
                    VALUES ($1, $2, $3, $4, $5, $6, true, $7)
                `, [dispositivo_id, sol.nombre, sol.descripcion, sol.ip, sol.mac, sol.sistema_operativo, sol.empresa_id]);
            }

            // Procesar cada dispositivo biométrico temporalmente enviado
            for (const dev of dispositivos_temp) {
                const device_id = dev.device_id;
                let biometrico_id;

                // Intentar encontrar si ya existe por device_id en este escritorio
                const bioExistente = device_id ? await client.query(
                    "SELECT id FROM biometrico WHERE device_id = $1 AND escritorio_id = $2 LIMIT 1",
                    [device_id, dispositivo_id]
                ) : { rows: [] };

                if (bioExistente.rows.length > 0) {
                    biometrico_id = bioExistente.rows[0].id;
                    // Reactivar y actualizar
                    await client.query(`
                        UPDATE biometrico SET
                            nombre = $1,
                            descripcion = $2,
                            tipo = $3,
                            ip = $4,
                            puerto = $5,
                            estado = 'desconectado',
                            es_activo = true
                        WHERE id = $6
                    `, [
                        dev.nombre || dev.name,
                        dev.descripcion || null,
                        dev.tipo || dev.type,
                        dev.ip || null,
                        dev.puerto || null,
                        biometrico_id
                    ]);
                } else {
                    // Crear nuevo
                    biometrico_id = await generateId(ID_PREFIXES.BIOMETRICO);
                    await client.query(`
                        INSERT INTO biometrico (id, nombre, descripcion, tipo, ip, puerto, estado, es_activo, escritorio_id, device_id)
                        VALUES ($1, $2, $3, $4, $5, $6, 'desconectado', true, $7, $8)
                    `, [
                        biometrico_id,
                        dev.nombre || dev.name,
                        dev.descripcion || null,
                        dev.tipo || dev.type,
                        dev.ip || null,
                        dev.puerto || null,
                        dispositivo_id,
                        device_id || null
                    ]);
                }
                biometricos_ids.push(biometrico_id);
            }

            // Actualizar el escritorio con los IDs de biométricos activos y otros datos
            await client.query(`
                UPDATE escritorio SET 
                    nombre = $2,
                    descripcion = $3,
                    ip = $4,
                    sistema_operativo = $5,
                    dispositivos_biometricos = $6,
                    empresa_id = $7,
                    es_activo = true
                WHERE id = $1
            `, [
                dispositivo_id,
                sol.nombre,
                sol.descripcion,
                sol.ip,
                sol.sistema_operativo,
                biometricos_ids.length > 0 ? JSON.stringify(biometricos_ids) : null,
                sol.empresa_id
            ]);

        } else if (sol.tipo === 'movil') {
            if (!empleado_id) {
                await client.query('ROLLBACK');
                return res.status(400).json({
                    success: false,
                    message: 'empleado_id es requerido para dispositivos móviles'
                });
            }

            // Buscar si ya existe un móvil para este empleado o con esta MAC
            let movilExistente = null;

            if (sol.mac) {
                const macSearch = await client.query(
                    "SELECT id FROM movil WHERE mac = $1 LIMIT 1",
                    [sol.mac]
                );
                if (macSearch.rows.length > 0) movilExistente = macSearch.rows[0];
            }

            if (!movilExistente) {
                const empleadoSearch = await client.query(
                    "SELECT id FROM movil WHERE empleado_id = $1 LIMIT 1",
                    [empleado_id]
                );
                if (empleadoSearch.rows.length > 0) movilExistente = empleadoSearch.rows[0];
            }

            if (movilExistente) {
                // Reactivar y actualizar los datos del dispositivo existente
                dispositivo_id = movilExistente.id;
                await client.query(`
                    UPDATE movil SET 
                        sistema_operativo = $2,
                        empleado_id = $3,
                        ip = $4,
                        mac = COALESCE($5, mac),
                        es_activo = true,
                        empresa_id = $6
                    WHERE id = $1
                `, [dispositivo_id, sol.sistema_operativo, empleado_id, sol.ip, sol.mac, sol.empresa_id]);
            } else {
                // Crear el dispositivo móvil nuevo
                dispositivo_id = await generateId(ID_PREFIXES.MOVIL);
                await client.query(`
                    INSERT INTO movil (id, sistema_operativo, es_root, es_activo, empleado_id, ip, mac, empresa_id)
                    VALUES ($1, $2, false, true, $3, $4, $5, $6)
                `, [dispositivo_id, sol.sistema_operativo, empleado_id, sol.ip, sol.mac, sol.empresa_id]);
            }
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

        const responseData = { solicitud_id: id, dispositivo_id, tipo: sol.tipo, empresa_id: sol.empresa_id };
        if (biometricos_ids.length > 0) { responseData.biometricos_ids = biometricos_ids; }

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
            SELECT id, tipo, estado, fecha_respuesta, observaciones, mac, empresa_id
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
            observaciones: solicitud.observaciones,
            empresa_id: solicitud.empresa_id
        };

        // Si está aceptada y es tipo escritorio, buscar el escritorio_id por MAC
        if (solicitud.estado === 'aceptado' && solicitud.tipo === 'escritorio' && solicitud.mac) {
            const escritorio = await pool.query(
                'SELECT id FROM escritorio WHERE mac = $1',
                [solicitud.mac]
            );
            if (escritorio.rows.length > 0) {
                const escritorioId = escritorio.rows[0].id;
                responseData.escritorio_id = escritorioId;

                // Generar Token de Acceso para el Escritorio (365 días)
                // Usamos un payload compatible con el middleware de autenticación
                const payload = {
                    sub: escritorioId,
                    usuario: 'SISTEMA_ESCRITORIO',
                    empresa_id: solicitud.empresa_id,
                    esAdmin: false,
                    roles: ['Kiosko']
                };

                responseData.auth_token = jwt.sign(
                    payload,
                    process.env.JWT_SECRET || 'default_secret',
                    { expiresIn: '365d' }
                );
                
                console.log(`✅ Token generado para escritorio afiliado: ${escritorioId}`);
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

    if (token.startsWith('saas_')) {
        addClient(res);
        return;
    }

    try {
        // Decodificar JWT para obtener el userId real
        let userId = token;
        try {
            const { default: jwt } = await import('jsonwebtoken');
            const decoded = jwt.verify(token, process.env.JWT_SECRET || 'default_secret');
            userId = decoded.sub;
        } catch {
            // No es JWT válido, tratar como userId directo (legacy)
            userId = token;
        }

        const resultado = await pool.query(
            "SELECT id FROM usuarios WHERE id = $1 AND estado_cuenta = 'activo'",
            [userId]
        );

        if (resultado.rows.length === 0) {
            return res.status(401).json({ success: false, message: 'Token inválido' });
        }

        addClient(res);
    } catch (error) {
        console.error('Error en SSE solicitudes stream:', error);
        return res.status(500).json({ success: false, message: 'Error de autenticación' });
    }
}

/**
 * DELETE /api/solicitudes/:id
 * Cancela una solicitud (cambia estado a rechazado)
 * Endpoint público para que el usuario pueda cancelar su propia solicitud
 */
export async function cancelarSolicitud(req, res) {
    try {
        const { id } = req.params;

        const resultado = await pool.query(`
            UPDATE solicitudes SET
                estado = 'rechazado',
                fecha_respuesta = CURRENT_TIMESTAMP,
                observaciones = 'Cancelado por el usuario'
            WHERE id = $1
            RETURNING *
        `, [id]);

        if (resultado.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Solicitud no encontrada'
            });
        }

        const sol = resultado.rows[0];

        // Registrar evento
        await registrarEvento({
            titulo: `Solicitud cancelada por usuario`,
            descripcion: `Solicitud ${sol.nombre} cancelada por el usuario`,
            tipo_evento: TIPOS_EVENTO.SOLICITUD,
            prioridad: PRIORIDADES.BAJA,
            detalles: { solicitud_id: id, tipo: sol.tipo }
        });

        // Notificar a clientes SSE
        broadcast('solicitud-actualizada', { id, estado: 'rechazado', tipo: sol.tipo });

        res.json({
            success: true,
            message: 'Solicitud cancelada correctamente',
            data: sol
        });

    } catch (error) {
        console.error('Error en cancelarSolicitud:', error);
        res.status(500).json({
            success: false,
            message: 'Error al cancelar solicitud'
        });
    }
}