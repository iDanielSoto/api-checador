import pkg from 'pg';
const pool = new pkg.Pool({ user: 'postgres', host: 'localhost', database: 'checador-fas', password: 'Minions090405', port: 5432 });

async function migrate() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Columna alertas en asistencias: JSONB para guardar advertencias estructuradas de red, GPS, WiFi
        await client.query(`
            ALTER TABLE asistencias
            ADD COLUMN IF NOT EXISTS alertas JSONB DEFAULT '[]'::jsonb
        `);
        console.log('✅ Columna alertas añadida a asistencias');

        // Columna advertencia_red en solicitudes: boolean para marcar que la IP no pertenece a la malla
        await client.query(`
            ALTER TABLE solicitudes
            ADD COLUMN IF NOT EXISTS advertencia_red BOOLEAN DEFAULT false
        `);
        console.log('✅ Columna advertencia_red añadida a solicitudes');

        await client.query('COMMIT');
        console.log('✅ Migración completada');
    } catch (e) {
        await client.query('ROLLBACK');
        console.error('❌ Error en migración:', e.message);
    } finally {
        client.release();
        process.exit(0);
    }
}

migrate();
