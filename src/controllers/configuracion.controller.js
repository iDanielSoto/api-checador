import { pool } from '../config/db.js';

/**
 * GET /api/configuracion
 * Obtiene la configuración actual del sistema
 */
export async function getConfiguracion(req, res) {
    try {
        const resultado = await pool.query(`
            SELECT
                c.*,
                e.id as empresa_id,
                e.nombre as empresa_nombre,
                e.logo as empresa_logo
            FROM configuraciones c
            LEFT JOIN empresas e ON e.configuracion_id = c.id
            LIMIT 1
        `);

        if (resultado.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Configuración no encontrada'
            });
        }

        res.json({
            success: true,
            data: resultado.rows[0]
        });

    } catch (error) {
        console.error('Error en getConfiguracion:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener configuración'
        });
    }
}

/**
 * GET /api/configuracion/:id
 * Obtiene una configuración específica por ID
 */
export async function getConfiguracionById(req, res) {
    try {
        const { id } = req.params;

        const resultado = await pool.query(`
            SELECT * FROM configuraciones WHERE id = $1
        `, [id]);

        if (resultado.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Configuración no encontrada'
            });
        }

        res.json({
            success: true,
            data: resultado.rows[0]
        });

    } catch (error) {
        console.error('Error en getConfiguracionById:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener configuración'
        });
    }
}

/**
 * PUT /api/configuracion/:id
 * Actualiza la configuración del sistema
 */
export async function updateConfiguracion(req, res) {
    try {
        const { id } = req.params;
        console.log('DEBUG: Actualizando Configuración ID:', id, req.body);
        const {
            idioma,
            es_mantenimiento,
            formato_fecha,
            formato_hora,
            zona_horaria,
            paleta_colores,
            intentos_maximos,
            orden_credenciales,
            segmentos_red,
            intervalo_bloques_minutos,
            requiere_salida
        } = req.body;

        const paletaJson = paleta_colores ? JSON.stringify(paleta_colores) : null;
        const ordenJson = orden_credenciales ? JSON.stringify(orden_credenciales) : null;
        const segmentosJson = segmentos_red ? JSON.stringify(segmentos_red) : null;

        const resultado = await pool.query(`
            UPDATE configuraciones SET
                idioma = $1,
                es_mantenimiento = $2,
                formato_fecha = $3,
                formato_hora = $4,
                zona_horaria = $5,
                paleta_colores = $6,
                intentos_maximos = $7,
                orden_credenciales = $8,
                segmentos_red = $9,
                intervalo_bloques_minutos = $11,
                requiere_salida = $12
            WHERE id = $10
            RETURNING *
        `, [
            idioma || 'es',
            es_mantenimiento ?? false,
            formato_fecha || 'DD/MM/YYYY',
            formato_hora || '24',
            zona_horaria || 'America/Mexico_City',
            paletaJson,
            intentos_maximos ?? 3,
            ordenJson,
            segmentosJson,
            id,
            intervalo_bloques_minutos ?? 60,
            requiere_salida ?? true
        ]);

        if (resultado.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Configuración no encontrada'
            });
        }

        res.json({
            success: true,
            message: 'Configuración actualizada correctamente',
            data: resultado.rows[0]
        });

    } catch (error) {
        console.error('Error en updateConfiguracion:', error);
        res.status(500).json({
            success: false,
            message: 'Error al actualizar configuración'
        });
    }
}

/**
 * PATCH /api/configuracion/:id/mantenimiento
 * Activa/desactiva modo mantenimiento
 */
export async function toggleMantenimiento(req, res) {
    try {
        const { id } = req.params;
        const { es_mantenimiento } = req.body;

        if (es_mantenimiento === undefined) {
            return res.status(400).json({
                success: false,
                message: 'es_mantenimiento es requerido'
            });
        }

        const resultado = await pool.query(`
            UPDATE configuraciones SET es_mantenimiento = $1
            WHERE id = $2
            RETURNING id, es_mantenimiento
        `, [es_mantenimiento, id]);

        if (resultado.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Configuración no encontrada'
            });
        }

        res.json({
            success: true,
            message: es_mantenimiento ? 'Modo mantenimiento activado' : 'Modo mantenimiento desactivado',
            data: resultado.rows[0]
        });

    } catch (error) {
        console.error('Error en toggleMantenimiento:', error);
        res.status(500).json({
            success: false,
            message: 'Error al cambiar modo mantenimiento'
        });
    }
}

/**
 * GET /api/configuracion/public/status
 * Obtiene el estado de mantenimiento público
 */
export async function getMantenimientoStatus(req, res) {
    try {
        const resultado = await pool.query('SELECT es_mantenimiento FROM configuraciones LIMIT 1');

        if (resultado.rows.length === 0) {
            return res.json({
                success: true,
                maintenance: false // Default to false if no config found
            });
        }

        res.json({
            success: true,
            maintenance: resultado.rows[0].es_mantenimiento
        });
    } catch (error) {
        console.error('Error en getMantenimientoStatus:', error);
        res.status(500).json({
            success: false,
            message: 'Error al verificar estado del sistema'
        });
    }
}


