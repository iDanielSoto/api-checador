import { pool } from './src/config/db.js';

async function updateDb() {
    try {
        await pool.query('ALTER TABLE tolerancias ADD COLUMN IF NOT EXISTS minutos_anticipo_salida INT DEFAULT 0');
        await pool.query('ALTER TABLE tolerancias ADD COLUMN IF NOT EXISTS minutos_posterior_salida INT DEFAULT 60');
        console.log('Columns added successfully');
    } catch (e) {
        console.error(e);
    } finally {
        process.exit(0);
    }
}
updateDb();
