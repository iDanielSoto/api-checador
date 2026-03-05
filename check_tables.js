
import { pool } from './src/config/db.js';
async function test() {
    try {
        const res = await pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';");
        console.log(JSON.stringify(res.rows, null, 2));
    } catch (e) { console.error(e); } finally { await pool.end(); }
}
test();
