
import { pool } from './src/config/db.js';

async function check() {
    try {
        const res = await pool.query(`
            SELECT 
                e.id as emp_id, 
                e.nombre,
                e.configuracion_id, 
                c.tolerancia_id 
            FROM empresas e 
            LEFT JOIN configuraciones c ON c.id = e.configuracion_id 
            WHERE e.nombre ILIKE '%ITLAC%' OR e.id = 'MASTER'
        `);
        console.log(JSON.stringify(res.rows, null, 2));
    } catch (e) {
        console.error(e);
    } finally {
        await pool.end();
    }
}
check();
