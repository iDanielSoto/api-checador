
import { pool } from './src/config/db.js';
async function test() {
    try {
        const res = await pool.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'configuraciones';");
        console.log(JSON.stringify(res.rows, null, 2));
    } catch (e) { console.error(e); } finally { await pool.end(); }
}
test();
