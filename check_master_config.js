
import { pool } from './src/config/db.js';

async function check() {
    try {
        const res = await pool.query("SELECT * FROM configuraciones WHERE id = 'SYS-CFG-00000000000000000000000000000004'");
        console.log(JSON.stringify(res.rows, null, 2));
    } catch (e) {
        console.error(e);
    } finally {
        await pool.end();
    }
}
check();
