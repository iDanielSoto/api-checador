
import { pool } from './src/config/db.js';

async function check() {
    try {
        const res = await pool.query(`
            SELECT 
                e.nombre,
                c.requiere_salida,
                c.intervalo_bloques_minutos,
                t.minutos_anticipado_max,
                t.minutos_anticipo_salida,
                t.minutos_posterior_salida
            FROM empresas e
            JOIN configuraciones c ON c.id = e.configuracion_id
            JOIN tolerancias t ON t.id = c.tolerancia_id
            WHERE e.id = 'MASTER'
        `);
        console.log(JSON.stringify(res.rows[0], null, 2));
    } catch (e) {
        console.error(e);
    } finally {
        await pool.end();
    }
}
check();
