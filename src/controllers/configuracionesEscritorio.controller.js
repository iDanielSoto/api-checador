import { pool } from '../config/db.js';
import crypto from 'crypto';
import { registrarEvento, TIPOS_EVENTO, PRIORIDADES } from '../utils/eventos.js';

export async function getConfiguracionEscritorio(req, res) {
    try {
        const { escritorio_id } = req.params;

        // Validar que el escritorio exista (relajando req.empresa_id si hay problemas en modo admin)
        const escRes = await pool.query('SELECT id, empresa_id FROM escritorio WHERE id = $1', [escritorio_id]);
        if (escRes.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Dispositivo no encontrado' });
        }

        const empresaIdReal = escRes.rows[0].empresa_id;

        let cfgRes = await pool.query('SELECT * FROM configuraciones_escritorio WHERE escritorio_id = $1', [escritorio_id]);

        if (cfgRes.rows.length === 0) {
            // Crear una por defecto
            const empRes = await pool.query('SELECT configuracion_id FROM empresas WHERE id = $1', [empresaIdReal]);
            const configId = empRes.rows[0]?.configuracion_id || null;

            const newId = crypto.randomUUID();
            cfgRes = await pool.query(`
                INSERT INTO configuraciones_escritorio (
                    id, configuracion_id, escritorio_id, sincronizacion_automatica, 
                    frecuencia_sincronizacion_min, modo_offline_permitido,
                    iniciar_con_windows, forzar_pantalla_completa, bloquear_cierre_app,
                    pin_administrador, metodos_autenticacion, prioridad_biometrico
                ) VALUES (
                    $1, $2, $3, true, 15, true, false, false, false, '', 
                    '{"huella": true, "rostro": true, "codigo": true}'::jsonb,
                    '[{"metodo":"huella","activo":true,"nivel":1},{"metodo":"rostro","activo":true,"nivel":2},{"metodo":"codigo","activo":true,"nivel":3}]'::jsonb
                ) RETURNING *
            `, [newId, configId, escritorio_id]);
        }

        res.json({ success: true, data: cfgRes.rows[0] });
    } catch (error) {
        console.error('Error en getConfiguracionEscritorio:', error);
        res.status(500).json({ success: false, message: 'Error al obtener la configuración' });
    }
}

export async function updateConfiguracionEscritorio(req, res) {
    try {
        const { escritorio_id } = req.params;

        // Validar
        const escRes = await pool.query('SELECT id, nombre FROM escritorio WHERE id = $1', [escritorio_id]);
        if (escRes.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Dispositivo no encontrado' });
        }

        const {
            sincronizacion_automatica,
            frecuencia_sincronizacion_min,
            modo_offline_permitido,
            iniciar_con_windows,
            forzar_pantalla_completa,
            bloquear_cierre_app,
            pin_administrador,
            metodos_autenticacion,
            prioridad_biometrico,
            es_activo,
            es_mantenimiento
        } = req.body;

        const metodosJson = metodos_autenticacion ? JSON.stringify(metodos_autenticacion) : null;
        const prioridadJson = prioridad_biometrico ? JSON.stringify(prioridad_biometrico) : null;

        const result = await pool.query(`
            UPDATE configuraciones_escritorio SET
                sincronizacion_automatica = COALESCE($1, sincronizacion_automatica),
                frecuencia_sincronizacion_min = COALESCE($2, frecuencia_sincronizacion_min),
                modo_offline_permitido = COALESCE($3, modo_offline_permitido),
                iniciar_con_windows = COALESCE($4, iniciar_con_windows),
                forzar_pantalla_completa = COALESCE($5, forzar_pantalla_completa),
                bloquear_cierre_app = COALESCE($6, bloquear_cierre_app),
                pin_administrador = COALESCE($7, pin_administrador),
                metodos_autenticacion = COALESCE($8, metodos_autenticacion),
                es_activo = COALESCE($9, es_activo),
                prioridad_biometrico = COALESCE($11, prioridad_biometrico),
                es_mantenimiento = COALESCE($12, es_mantenimiento),
                actualizado_en = CURRENT_TIMESTAMP
            WHERE escritorio_id = $10
            RETURNING *
        `, [
            sincronizacion_automatica, frecuencia_sincronizacion_min, modo_offline_permitido,
            iniciar_con_windows, forzar_pantalla_completa, bloquear_cierre_app,
            pin_administrador, metodosJson, es_activo, escritorio_id, prioridadJson, es_mantenimiento
        ]);

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Configuración no encontrada para el dispositivo' });
        }

        await registrarEvento({
            titulo: 'Configuración de dispositivo actualizada',
            descripcion: `Se actualizó la configuración local del escritorio "${escRes.rows[0].nombre}"`,
            tipo_evento: TIPOS_EVENTO.DISPOSITIVO,
            prioridad: PRIORIDADES.BAJA,
            usuario_modificador_id: req.usuario?.id,
            detalles: { escritorio_id, cambios: req.body }
        });

        res.json({ success: true, message: 'Configuración actualizada', data: result.rows[0] });
    } catch (error) {
        console.error('Error en updateConfiguracionEscritorio:', error);
        res.status(500).json({ success: false, message: 'Error al actualizar la configuración' });
    }
}
