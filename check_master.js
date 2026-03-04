
import { pool } from './src/config/db.js';

async function run() {
    try {
        const res = await pool.query("SELECT id, nombre FROM empresas WHERE id = 'MASTER'");
        console.log('Resultados de MASTER:');
        console.log(JSON.stringify(res.rows, null, 2));

        const res2 = await pool.query("SELECT id, nombre FROM empresas LIMIT 10");
        console.log('\nPrimeras 10 empresas:');
        console.log(JSON.stringify(res2.rows, null, 2));
    } catch (err) {
        console.error(err);
    } finally {
        await pool.end();
    }
}

run();
