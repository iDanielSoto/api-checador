import 'dotenv/config';
import { pool } from './src/config/db.js';

async function check() {
    const res = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'usuarios'");
    console.log(res.rows.map(x => x.column_name));
    process.exit(0);
}

check();
