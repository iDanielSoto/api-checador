import pool from '../src/config/db.js';

async function test() {
    try {
        const result = await pool.query("SELECT * FROM biometrico WHERE escritorio_id = 'ITL-ESC-00000000000000000000000000000007'");
        console.log(JSON.stringify(result.rows, null, 2));
    } catch (e) {
        console.error(e);
    } finally {
        process.exit();
    }
}

test();
