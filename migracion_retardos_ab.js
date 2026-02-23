/**
 * migracion_retardos_ab.js
 * 
 * Agrega los 4 campos de configuración de Retardo A/B a la tabla tolerancias.
 */
import pkg from 'pg';
const pool = new pkg.Pool({ user: 'postgres', host: 'localhost', database: 'checador-fas', password: 'Minions090405', port: 5432 });

async function migrate() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // minutos_retardo_a_max: límite superior del Retardo A (por defecto 20 min)
        await client.query(`ALTER TABLE tolerancias ADD COLUMN IF NOT EXISTS minutos_retardo_a_max INTEGER DEFAULT 20`);
        // minutos_retardo_b_max: límite superior del Retardo B (por defecto 29 min)
        await client.query(`ALTER TABLE tolerancias ADD COLUMN IF NOT EXISTS minutos_retardo_b_max INTEGER DEFAULT 29`);
        // equivalencia_retardo_a: cuántos Retardo A = 1 falta (por defecto 10)
        await client.query(`ALTER TABLE tolerancias ADD COLUMN IF NOT EXISTS equivalencia_retardo_a INTEGER DEFAULT 10`);
        // equivalencia_retardo_b: cuántos Retardo B = 1 falta (por defecto 5)
        await client.query(`ALTER TABLE tolerancias ADD COLUMN IF NOT EXISTS equivalencia_retardo_b INTEGER DEFAULT 5`);

        await client.query('COMMIT');
        console.log('✅ Columnas de Retardo A/B añadidas a tolerancias');

        // Verificar
        const r = await pool.query(`
            SELECT id, nombre, minutos_retardo, minutos_retardo_a_max, minutos_retardo_b_max,
                   equivalencia_retardo_a, equivalencia_retardo_b
            FROM tolerancias LIMIT 3
        `);
        console.log('\nDatos actuales:');
        console.table(r.rows);
    } catch (e) {
        await client.query('ROLLBACK');
        console.error('❌ Error:', e.message);
    } finally {
        client.release();
        process.exit(0);
    }
}

migrate();
