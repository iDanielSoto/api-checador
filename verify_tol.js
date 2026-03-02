import { pool } from './src/config/db.js';

async function verify() {
    const p1 = await pool.query("SELECT table_name, column_name FROM information_schema.columns WHERE column_name = 'tolerancia_id'");
    console.log("Columnas 'tolerancia_id':", p1.rows);
    process.exit(0);
}
verify();
