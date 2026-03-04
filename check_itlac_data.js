
import { pool } from './src/config/db.js';

async function check() {
    try {
        const cfg = await pool.query("SELECT * FROM configuraciones WHERE id = 'ITL-CFG-0000000000000000'");
        const tol = await pool.query("SELECT * FROM tolerancias WHERE id = 'ITL-TOL-0000000000000000'");
        console.log('--- CONFIG ---');
        console.log(JSON.stringify(cfg.rows, null, 2));
        console.log('\n--- TOLERANCIA ---');
        console.log(JSON.stringify(tol.rows, null, 2));
    } catch (e) {
        console.error(e);
    } finally {
        await pool.end();
    }
}
check();
