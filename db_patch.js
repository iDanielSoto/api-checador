
import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'checador-fas',
    password: 'Minions090405',
    port: 5432,
});

async function run() {
    try {
        console.log("Checking columns in 'tolerancias'...");
        const res = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'tolerancias' 
      AND column_name IN ('minutos_anticipo_salida', 'minutos_posterior_salida');
    `);

        const existingColumns = res.rows.map(r => r.column_name);
        console.log("Existing columns:", existingColumns);

        if (!existingColumns.includes('minutos_anticipo_salida')) {
            console.log("Adding 'minutos_anticipo_salida'...");
            await pool.query("ALTER TABLE tolerancias ADD COLUMN minutos_anticipo_salida INTEGER DEFAULT 0;");
        }

        if (!existingColumns.includes('minutos_posterior_salida')) {
            console.log("Adding 'minutos_posterior_salida'...");
            await pool.query("ALTER TABLE tolerancias ADD COLUMN minutos_posterior_salida INTEGER DEFAULT 60;");
        }

        console.log("Success!");
    } catch (err) {
        console.error("Error:", err);
    } finally {
        await pool.end();
    }
}

run();
