import { pool } from './src/config/db.js';

async function check() {
    const q1 = await pool.query('SELECT column_name, data_type FROM information_schema.columns WHERE table_name = \'configuraciones\'');
    console.log("Configuraciones:");
    console.table(q1.rows);

    const q2 = await pool.query('SELECT column_name, data_type FROM information_schema.columns WHERE table_name = \'empresas\'');
    console.log("Empresas:");
    console.table(q2.rows);

    process.exit(0);
}
check();
