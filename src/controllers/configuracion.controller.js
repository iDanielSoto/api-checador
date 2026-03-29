import { pool } from '../config/db.js';

/**
 * GET /api/configuracion
 * Obtiene la configuración actual del sistema
 */
export async function getConfiguracion(req, res) {
    try {
        // Multi-tenant: buscar la configuración de la empresa del usuario autenticado
        const empresaId = req.empresa_id || req.usuario?.empresa_id;
        let resultado;

        if (empresaId && empresaId !== 'MASTER') {
            resultado = await pool.query(`
                SELECT
                    c.*,
                    e.id as empresa_id,
                    e.nombre as empresa_nombre,
                    e.logo as empresa_logo
                FROM configuraciones c
                INNER JOIN empresas e ON e.configuracion_id = c.id
                WHERE e.id = $1
                ORDER BY c.id DESC
                LIMIT 1
            `, [empresaId]);
        } else {
            // Fallback para SaaS admin sin empresa específica
            resultado = await pool.query(`
                SELECT
                    c.*,
                    e.id as empresa_id,
                    e.nombre as empresa_nombre,
                    e.logo as empresa_logo
                FROM configuraciones c
                LEFT JOIN empresas e ON e.configuracion_id = c.id
                ORDER BY c.id DESC
                LIMIT 1
            `);
        }

        if (resultado.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Configuración no encontrada'
            });
        }

        const configData = resultado.rows[0];
        console.log('[API Backend] empresa_id:', empresaId, '| orden_credenciales raw:', configData.orden_credenciales);

        // Parsear orden_credenciales si viene como string, o aplicar fallback si es null
        if (!configData.orden_credenciales) {
            configData.orden_credenciales = [
                { metodo: 'pin', activo: true, nivel: 1 },
                { metodo: 'dactilar', activo: true, nivel: 2 },
                { metodo: 'facial', activo: true, nivel: 3 }
            ];
        } else if (typeof configData.orden_credenciales === 'string') {
            try { configData.orden_credenciales = JSON.parse(configData.orden_credenciales); } catch (e) { }
        }

        res.json({
            success: true,
            data: configData
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
            ORDER BY id DESC
        `, [id]);

        if (resultado.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Configuración no encontrada'
            });
        }

        const configData = resultado.rows[0];

        // Asegurar que orden_credenciales es un array con valor predeterminado si es null
        if (!configData.orden_credenciales) {
            configData.orden_credenciales = [
                { metodo: 'pin', activo: true, nivel: 1 },
                { metodo: 'dactilar', activo: true, nivel: 2 },
                { metodo: 'facial', activo: true, nivel: 3 }
            ];
        } else if (typeof configData.orden_credenciales === 'string') {
            try { configData.orden_credenciales = JSON.parse(configData.orden_credenciales); } catch (e) { }
        }

        res.json({
            success: true,
            data: configData
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
            requiere_salida,
            cooldown_bloqueo
        } = req.body;

        // Si orden_credenciales llega como string ya serializado, parsear primero
        // para evitar doble-serialización ("\"[...]\"" en vez de [...])
        let ordenNorm = orden_credenciales;
        if (typeof ordenNorm === 'string') {
            try { ordenNorm = JSON.parse(ordenNorm); } catch (e) { ordenNorm = null; }
        }
        // Asegurar que guardamos objetos {metodo, activo, nivel}
        if (Array.isArray(ordenNorm)) {
            ordenNorm = ordenNorm.map((item, index) => {
                if (typeof item === 'string') {
                    const met = item === 'huella' ? 'dactilar' : item;
                    return { metodo: met, activo: true, nivel: index + 1 };
                }
                const met = item?.metodo === 'huella' ? 'dactilar' : (item?.metodo || '');
                return { ...item, metodo: met, nivel: item.nivel || index + 1 };
            });
        }

        const paletaJson = paleta_colores ? JSON.stringify(paleta_colores) : null;
        const ordenJson = ordenNorm ? JSON.stringify(ordenNorm) : null;
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
                requiere_salida = $12,
                cooldown_bloqueo = $13
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
            requiere_salida ?? true,
            cooldown_bloqueo ?? 1800
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
