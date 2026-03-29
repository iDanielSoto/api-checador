import { pool } from './src/config/db.js';

async function listConfigs() {
    try {
        const res = await pool.query('SELECT id, intentos_maximos, cooldown_bloqueo FROM configuraciones');
        console.log(JSON.stringify(res.rows, null, 2));
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

listConfigs();
