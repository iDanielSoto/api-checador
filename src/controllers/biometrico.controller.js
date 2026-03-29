import { pool } from '../config/db.js';
import { generateId, ID_PREFIXES } from '../utils/idGenerator.js';
import { registrarEvento, TIPOS_EVENTO, PRIORIDADES } from '../utils/eventos.js';

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
            INNER JOIN escritorio e ON e.id = b.escritorio_id
            WHERE e.empresa_id = $1
        `;
        const params = [req.empresa_id];
        let paramIndex = 2;

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
            INNER JOIN escritorio e ON e.id = b.escritorio_id
            WHERE b.id = $1 AND e.empresa_id = $2
        `, [id, req.empresa_id]);

        if (resultado.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Lector biométrico no encontrado o no pertenece a la empresa'
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
            escritorio_id,
            device_id    // identificador real del hardware
        } = req.body;

        if (!nombre || !tipo || !escritorio_id) {
            return res.status(400).json({
                success: false,
                message: 'nombre, tipo y escritorio_id son requeridos'
            });
        }

        // 1. Validar que el escritorio pertenezca a la empresa
        const escRes = await pool.query('SELECT id FROM escritorio WHERE id = $1 AND empresa_id = $2', [escritorio_id, req.empresa_id]);
        if (escRes.rows.length === 0) {
            return res.status(403).json({
                success: false,
                message: 'El escritorio especificado no pertenece a su empresa o no existe'
            });
        }

        // 2. Verificar duplicados por device_id en el mismo escritorio
        if (device_id) {
            const existe = await pool.query(
                'SELECT id, es_activo FROM biometrico WHERE device_id = $1 AND escritorio_id = $2',
                [device_id, escritorio_id]
            );

            if (existe.rows.length > 0) {
                const lector = existe.rows[0];
                if (lector.es_activo) {
                    return res.status(400).json({
                        success: false,
                        message: 'Este dispositivo ya se encuentra registrado y activo en este escritorio'
                    });
                } else {
                    // REACTIVACIÓN AUTOMÁTICA
                    const reactivado = await pool.query(`
                        UPDATE biometrico SET
                            nombre = $1,
                            descripcion = $2,
                            tipo = $3,
                            puerto = $4,
                            ip = $5,
                            estado = 'desconectado',
                            es_activo = true
                        WHERE id = $6
                        RETURNING *
                    `, [nombre, descripcion, tipo, puerto, ip, lector.id]);

                    await registrarEvento({
                        titulo: 'Lector biométrico reactivado',
                        descripcion: `Se reactivó automáticamente el lector "${nombre}" (${device_id})`,
                        tipo_evento: TIPOS_EVENTO.DISPOSITIVO,
                        prioridad: PRIORIDADES.MEDIA,
                        usuario_modificador_id: req.usuario?.id,
                        detalles: { biometrico_id: lector.id, device_id, escritorio_id }
                    });

                    return res.json({
                        success: true,
                        message: 'Dispositivo reactivado correctamente',
                        data: reactivado.rows[0]
                    });
                }
            }
        }

        const id = await generateId(ID_PREFIXES.BIOMETRICO);

        const resultado = await pool.query(`
            INSERT INTO biometrico (id, nombre, descripcion, tipo, puerto, ip, estado, es_activo, escritorio_id, device_id)
            VALUES ($1, $2, $3, $4, $5, $6, 'desconectado', true, $7, $8)
            RETURNING *
        `, [id, nombre, descripcion, tipo, puerto, ip, escritorio_id, device_id]);

        // Registrar evento
        await registrarEvento({
            titulo: 'Lector biométrico registrado',
            descripcion: `Se registró el lector biométrico "${nombre}" (${tipo})`,
            tipo_evento: TIPOS_EVENTO.DISPOSITIVO,
            prioridad: PRIORIDADES.MEDIA,
            usuario_modificador_id: req.usuario?.id,
            detalles: { biometrico_id: id, nombre, tipo, escritorio_id }
        });

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
            escritorio_id,
            device_id
        } = req.body;

        const resultado = await pool.query(`
            UPDATE biometrico b SET
                nombre = COALESCE($1, b.nombre),
                descripcion = COALESCE($2, b.descripcion),
                tipo = COALESCE($3, b.tipo),
                puerto = COALESCE($4, b.puerto),
                ip = COALESCE($5, b.ip),
                estado = COALESCE($6, b.estado),
                es_activo = COALESCE($7, b.es_activo),
                escritorio_id = COALESCE($8, b.escritorio_id),
                device_id = COALESCE($9, b.device_id)
            FROM escritorio e
            WHERE b.id = $10 AND b.escritorio_id = e.id AND e.empresa_id = $11
            RETURNING b.*
        `, [nombre, descripcion, tipo, puerto, ip, estado, es_activo, escritorio_id, device_id, id, req.empresa_id]);

        if (resultado.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Lector biométrico no encontrado o no pertenece a la empresa'
            });
        }

        // Registrar evento
        await registrarEvento({
            titulo: 'Lector biométrico actualizado',
            descripcion: `Se actualizó el lector biométrico "${resultado.rows[0].nombre}"`,
            tipo_evento: TIPOS_EVENTO.DISPOSITIVO,
            prioridad: PRIORIDADES.BAJA,
            usuario_modificador_id: req.usuario?.id,
            detalles: { biometrico_id: id, cambios: req.body }
        });

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
            UPDATE biometrico b SET estado = $1
            FROM escritorio e
            WHERE b.id = $2 AND b.escritorio_id = e.id AND e.empresa_id = $3 AND b.es_activo = true
            RETURNING b.id, b.nombre, b.estado
        `, [estado, id, req.empresa_id]);

        if (resultado.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Lector biométrico no encontrado o no pertenece a la empresa'
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
            UPDATE biometrico b SET es_activo = false
            FROM escritorio e
            WHERE b.id = $1 AND b.escritorio_id = e.id AND e.empresa_id = $2 AND b.es_activo = true
            RETURNING b.id
        `, [id, req.empresa_id]);

        if (resultado.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Lector no encontrado, ya desactivado o no pertenece a la empresa'
            });
        }

        // Registrar evento
        await registrarEvento({
            titulo: 'Lector biométrico desactivado',
            descripcion: `Se desactivó el lector biométrico ${id}`,
            tipo_evento: TIPOS_EVENTO.DISPOSITIVO,
            prioridad: PRIORIDADES.ALTA,
            usuario_modificador_id: req.usuario?.id,
            detalles: { biometrico_id: id }
        });

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
                COUNT(*) FILTER (WHERE b.estado = 'conectado') as conectados,
                COUNT(*) FILTER (WHERE b.estado = 'desconectado') as desconectados,
                COUNT(*) FILTER (WHERE b.estado = 'error') as con_error,
                COUNT(*) FILTER (WHERE b.tipo = 'facial') as faciales,
                COUNT(*) FILTER (WHERE b.tipo = 'dactilar') as dactilares
            FROM biometrico b
            INNER JOIN escritorio e ON e.id = b.escritorio_id
            WHERE b.es_activo = true AND e.empresa_id = $1
        `, [req.empresa_id]);

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

/**
 * POST /api/biometrico/sync-status
 * Sincroniza el estado de las cámaras de un kiosko/escritorio
 */
export async function syncBiometricoStatus(req, res) {
    const client = await pool.connect();
    try {
        const { escritorio_id, device_ids } = req.body;

        if (!escritorio_id) {
            return res.status(400).json({
                success: false,
                message: 'escritorio_id es requerido'
            });
        }

        if (!Array.isArray(device_ids)) {
            return res.status(400).json({
                success: false,
                message: 'device_ids debe ser un arreglo'
            });
        }

        await client.query('BEGIN');

        // 1. Poner todo en "desconectado" por defecto para este kiosko
        await client.query(`
            UPDATE biometrico 
            SET estado = 'desconectado' 
            WHERE escritorio_id = $1 AND es_activo = true
        `, [escritorio_id]);

        // 2. Encender solo las conectadas que coincidan
        if (device_ids.length > 0) {
            await client.query(`
                UPDATE biometrico 
                SET estado = 'conectado' 
                WHERE escritorio_id = $1 AND device_id = ANY($2) AND es_activo = true
            `, [escritorio_id, device_ids]);
        }

        // 3. Devolver las cámaras autorizadas
        const result = await client.query(`
            SELECT * 
            FROM biometrico 
            WHERE escritorio_id = $1 AND estado = 'conectado'
        `, [escritorio_id]);

        await client.query('COMMIT');

        res.json({
            success: true,
            data: result.rows
        });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error en syncBiometricoStatus:', error);
        res.status(500).json({
            success: false,
            message: 'Error al sincronizar estado de biométricos'
        });
    } finally {
        client.release();
    }
}
