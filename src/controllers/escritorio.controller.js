import { pool } from '../config/db.js';
import { generateId, ID_PREFIXES } from '../utils/idGenerator.js';
import { registrarEvento, TIPOS_EVENTO, PRIORIDADES } from '../utils/eventos.js';

/**
 * GET /api/escritorio
 * Obtiene todos los dispositivos de escritorio
 */
export async function getEscritorios(req, res) {
    try {
        const { es_activo } = req.query;

        let query = `
            SELECT
                e.id,
                e.nombre,
                e.descripcion,
                e.ip,
                e.mac,
                e.sistema_operativo,
                e.dispositivos_biometricos,
                e.es_activo,
                (SELECT COUNT(*) FROM biometrico b WHERE b.escritorio_id = e.id) as biometricos_count
            FROM escritorio e
            WHERE 1=1
        `;
        const params = [];

        if (es_activo !== undefined) {
            query += ` AND e.es_activo = $1`;
            params.push(es_activo === 'true');
        }

        query += ` ORDER BY e.nombre ASC`;

        const resultado = await pool.query(query, params);

        res.json({
            success: true,
            data: resultado.rows
        });

    } catch (error) {
        console.error('Error en getEscritorios:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener dispositivos de escritorio'
        });
    }
}

/**
 * GET /api/escritorio/:id
 * Obtiene un dispositivo de escritorio por ID
 */
export async function getEscritorioById(req, res) {
    try {
        const { id } = req.params;

        const resultado = await pool.query(`
            SELECT * FROM escritorio WHERE id = $1
        `, [id]);

        if (resultado.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Dispositivo no encontrado'
            });
        }

        // Obtener biométricos asociados
        const biometricos = await pool.query(`
            SELECT id, nombre, tipo, estado, es_activo
            FROM biometrico
            WHERE escritorio_id = $1
        `, [id]);

        res.json({
            success: true,
            data: {
                ...resultado.rows[0],
                biometricos: biometricos.rows
            }
        });

    } catch (error) {
        console.error('Error en getEscritorioById:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener dispositivo'
        });
    }
}

/**
 * POST /api/escritorio
 * Crea un nuevo dispositivo de escritorio
 */
export async function createEscritorio(req, res) {
    try {
        const {
            nombre,
            descripcion,
            ip,
            mac,
            sistema_operativo,
            dispositivos_biometricos
        } = req.body;

        if (ip && ip.length > 45) {
            return res.status(400).json({
                success: false,
                message: 'La dirección IP no debe exceder los 45 caracteres'
            });
        }

        if (mac && mac.length > 17) {
            return res.status(400).json({
                success: false,
                message: 'La dirección MAC no debe exceder los 17 caracteres'
            });
        }

        if (!nombre) {
            return res.status(400).json({
                success: false,
                message: 'El nombre es requerido'
            });
        }

        // Verificar MAC única si se proporciona
        if (mac) {
            const existe = await pool.query(
                'SELECT id FROM escritorio WHERE mac = $1',
                [mac]
            );
            if (existe.rows.length > 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Ya existe un dispositivo con esa MAC'
                });
            }
        }

        const id = await generateId(ID_PREFIXES.ESCRITORIO);

        const resultado = await pool.query(`
            INSERT INTO escritorio (id, nombre, descripcion, ip, mac, sistema_operativo, dispositivos_biometricos, es_activo)
            VALUES ($1, $2, $3, $4, $5, $6, $7, true)
            RETURNING *
        `, [id, nombre, descripcion, ip, mac, sistema_operativo, dispositivos_biometricos ? JSON.stringify(dispositivos_biometricos) : null]);

        // Registrar evento
        await registrarEvento({
            titulo: 'Dispositivo de escritorio creado',
            descripcion: `Se registró el dispositivo de escritorio "${nombre}"`,
            tipo_evento: TIPOS_EVENTO.DISPOSITIVO,
            prioridad: PRIORIDADES.MEDIA,
            usuario_modificador_id: req.usuario?.id,
            detalles: { escritorio_id: id, nombre, mac, ip }
        });

        res.status(201).json({
            success: true,
            message: 'Dispositivo de escritorio creado correctamente',
            data: resultado.rows[0]
        });

    } catch (error) {
        console.error('Error en createEscritorio:', error);
        res.status(500).json({
            success: false,
            message: 'Error al crear dispositivo'
        });
    }
}

/**
 * PUT /api/escritorio/:id
 * Actualiza un dispositivo de escritorio
 */
export async function updateEscritorio(req, res) {
    try {
        const { id } = req.params;
        const {
            nombre,
            descripcion,
            ip,
            mac,
            sistema_operativo,
            dispositivos_biometricos,
            es_activo
        } = req.body;

        if (ip && ip.length > 45) {
            return res.status(400).json({
                success: false,
                message: 'La dirección IP no debe exceder los 45 caracteres'
            });
        }

        if (mac && mac.length > 17) {
            return res.status(400).json({
                success: false,
                message: 'La dirección MAC no debe exceder los 17 caracteres'
            });
        }

        const bioJson = dispositivos_biometricos ? JSON.stringify(dispositivos_biometricos) : null;

        const resultado = await pool.query(`
            UPDATE escritorio SET
                nombre = COALESCE($1, nombre),
                descripcion = COALESCE($2, descripcion),
                ip = COALESCE($3, ip),
                mac = COALESCE($4, mac),
                sistema_operativo = COALESCE($5, sistema_operativo),
                dispositivos_biometricos = COALESCE($6, dispositivos_biometricos),
                es_activo = COALESCE($7, es_activo)
            WHERE id = $8
            RETURNING *
        `, [nombre, descripcion, ip, mac, sistema_operativo, bioJson, es_activo, id]);

        if (resultado.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Dispositivo no encontrado'
            });
        }

        // Registrar evento
        await registrarEvento({
            titulo: 'Dispositivo de escritorio actualizado',
            descripcion: `Se actualizó el dispositivo de escritorio "${resultado.rows[0].nombre}"`,
            tipo_evento: TIPOS_EVENTO.DISPOSITIVO,
            prioridad: PRIORIDADES.BAJA,
            usuario_modificador_id: req.usuario?.id,
            detalles: { escritorio_id: id, cambios: req.body }
        });

        res.json({
            success: true,
            message: 'Dispositivo actualizado correctamente',
            data: resultado.rows[0]
        });

    } catch (error) {
        console.error('Error en updateEscritorio:', error);
        res.status(500).json({
            success: false,
            message: 'Error al actualizar dispositivo'
        });
    }
}

/**
 * DELETE /api/escritorio/:id
 * Desactiva un dispositivo de escritorio
 */
export async function deleteEscritorio(req, res) {
    try {
        const { id } = req.params;

        const resultado = await pool.query(`
            UPDATE escritorio SET es_activo = false
            WHERE id = $1 AND es_activo = true
            RETURNING id
        `, [id]);

        if (resultado.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Dispositivo no encontrado o ya desactivado'
            });
        }

        // Registrar evento
        await registrarEvento({
            titulo: 'Dispositivo de escritorio desactivado',
            descripcion: `Se desactivó el dispositivo de escritorio ${id}`,
            tipo_evento: TIPOS_EVENTO.DISPOSITIVO,
            prioridad: PRIORIDADES.ALTA,
            usuario_modificador_id: req.usuario?.id,
            detalles: { escritorio_id: id }
        });

        res.json({
            success: true,
            message: 'Dispositivo desactivado correctamente'
        });

    } catch (error) {
        console.error('Error en deleteEscritorio:', error);
        res.status(500).json({
            success: false,
            message: 'Error al desactivar dispositivo'
        });
    }
}

/**
 * PATCH /api/escritorio/:id/reactivar
 * Reactiva un dispositivo de escritorio desactivado
 */
export async function reactivarEscritorio(req, res) {
    try {
        const { id } = req.params;

        const resultado = await pool.query(`
            UPDATE escritorio SET es_activo = true
            WHERE id = $1 AND es_activo = false
            RETURNING id
        `, [id]);

        if (resultado.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Dispositivo no encontrado o ya está activo'
            });
        }

        await registrarEvento({
            titulo: 'Dispositivo de escritorio reactivado',
            descripcion: `Se reactivó el dispositivo de escritorio ${id}`,
            tipo_evento: TIPOS_EVENTO.DISPOSITIVO,
            prioridad: PRIORIDADES.ALTA,
            usuario_modificador_id: req.usuario?.id,
            detalles: { escritorio_id: id }
        });

        res.json({
            success: true,
            message: 'Dispositivo reactivado correctamente'
        });

    } catch (error) {
        console.error('Error en reactivarEscritorio:', error);
        res.status(500).json({
            success: false,
            message: 'Error al reactivar dispositivo'
        });
    }
}
