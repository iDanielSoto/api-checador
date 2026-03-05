
import { pool } from './src/config/db.js';

async function check() {
    try {
        const res = await pool.query(`
            SELECT e.enumlabel
            FROM pg_type t
            JOIN pg_enum e ON t.oid = e.enumtypid
            WHERE t.typname = 'tipo_dispositivo_origen';
        `);
        console.log(JSON.stringify(res.rows, null, 2));
    } catch (e) {
        console.error(e);
    } finally {
        await pool.end();
    }
}
check();
