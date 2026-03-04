
import { pool } from './src/config/db.js';

async function check() {
    try {
        const data = {};

        const emp = await pool.query("SELECT id, nombre, configuracion_id FROM empresas WHERE id IN ('MASTER', 'ITL-EMA-00000000000000000000000000000001')");
        data.empresas = emp.rows;

        const configIds = emp.rows.map(r => r.configuracion_id).filter(id => id);
        if (configIds.length > 0) {
            const conf = await pool.query(`SELECT id, requiere_salida, intervalo_bloques_minutos, tolerancia_id FROM configuraciones WHERE id = ANY($1)`, [configIds]);
            data.configuraciones = conf.rows;

            const tolIds = conf.rows.map(r => r.tolerancia_id).filter(id => id);
            if (tolIds.length > 0) {
                const tol = await pool.query(`SELECT id, nombre, minutos_anticipado_max, minutos_anticipo_salida, minutos_posterior_salida FROM tolerancias WHERE id = ANY($1)`, [tolIds]);
                data.tolerancias = tol.rows;
            }
        }
        console.log(JSON.stringify(data, null, 2));
    } catch (e) {
        console.error(e);
    } finally {
        await pool.end();
    }
}
check();
