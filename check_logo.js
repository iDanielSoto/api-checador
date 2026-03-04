
import { pool } from './src/config/db.js';

async function run() {
    try {
        const res = await pool.query(`SELECT id, nombre, LENGTH(logo) as logo_len FROM empresas ORDER BY fecha_registro DESC LIMIT 5;`);
        console.log('Resultados de empresas:');
        res.rows.forEach(r => {
            console.log(`- ID: ${r.id}, Nombre: ${r.nombre}, Logo Length: ${r.logo_len || 0}`);
        });
    } catch (err) {
        console.error(err);
    } finally {
        await pool.end();
    }
}

run();
