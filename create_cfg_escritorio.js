
import { pool } from './src/config/db.js';

async function crearTabla() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS configuraciones_escritorio (
                id VARCHAR(100) PRIMARY KEY,
                configuracion_id VARCHAR(100) NOT NULL REFERENCES configuraciones(id) ON DELETE CASCADE,
                escritorio_id VARCHAR(100) NOT NULL REFERENCES escritorio(id) ON DELETE CASCADE,
                
                sincronizacion_automatica BOOLEAN DEFAULT TRUE,
                frecuencia_sincronizacion_min INTEGER DEFAULT 15,
                modo_offline_permitido BOOLEAN DEFAULT TRUE,
                
                iniciar_con_windows BOOLEAN DEFAULT FALSE,
                forzar_pantalla_completa BOOLEAN DEFAULT FALSE,
                bloquear_cierre_app BOOLEAN DEFAULT FALSE,
                pin_administrador VARCHAR(50),
                
                metodos_autenticacion JSONB DEFAULT '{"huella": true, "rostro": true, "codigo": true}'::jsonb,
                
                es_activo BOOLEAN DEFAULT TRUE,
                creado_en TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                actualizado_en TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log("Tabla 'configuraciones_escritorio' creada con éxito.");
    } catch (e) {
        console.error("Error creando la tabla:", e);
    } finally {
        await pool.end();
    }
}
crearTabla();
