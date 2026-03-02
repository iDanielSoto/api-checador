import 'dotenv/config';
import { pool } from './src/config/db.js';

async function migrate() {
    console.log('Migrando tolerancia a configuraciones globales...');
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // 1. Agregar columna tolerancia_id a configuraciones
        await client.query(`ALTER TABLE configuraciones ADD COLUMN IF NOT EXISTS tolerancia_id character varying`);

        // 2. Asignar la primera tolerancia activa de cada empresa a su respectiva configuracion
        const empresas = await client.query(`SELECT id, configuracion_id FROM empresas`);
        for (const empresa of empresas.rows) {
            const tolRes = await client.query(`
                SELECT id FROM tolerancias 
                WHERE empresa_id = $1 AND es_activo = true 
                ORDER BY fecha_registro ASC LIMIT 1
            `, [empresa.id]);

            if (tolRes.rows.length > 0) {
                const tolId = tolRes.rows[0].id;
                await client.query(`
                    UPDATE configuraciones 
                    SET tolerancia_id = $1 
                    WHERE id = $2
                `, [tolId, empresa.configuracion_id]);
                console.log(`Asignada tolerancia ${tolId} a la empresa ${empresa.id} (Config: ${empresa.configuracion_id})`);
            }
        }

        // 3. (Opcional) Eliminar la columna de roles si ya no se usa, pero lo omitimos por seguridad por ahora o lo hacemos.
        // await client.query('ALTER TABLE roles DROP COLUMN IF EXISTS tolerancia_id');

        await client.query('COMMIT');
        console.log('Migración completada exitosamente.');

    } catch (e) {
        await client.query('ROLLBACK');
        console.error('Error durante la migración:', e);
    } finally {
        client.release();
        process.exit(0);
    }
}

migrate();
