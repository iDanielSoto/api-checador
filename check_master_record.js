
import { pool } from './src/config/db.js';

async function check() {
    try {
        const res = await pool.query("SELECT * FROM empresas WHERE id = 'MASTER'");
        console.log(JSON.stringify(res.rows, null, 2));
    } catch (e) {
        console.error(e);
    } finally {
        await pool.end();
    }
}
check();
