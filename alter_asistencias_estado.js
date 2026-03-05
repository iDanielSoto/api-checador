
import { pool } from './src/config/db.js';

async function check() {
    try {
        await pool.query(`
            ALTER TABLE asistencias 
            ALTER COLUMN estado TYPE character varying(50) 
            USING estado::character varying;
        `);
        console.log("Columna 'estado' alterada a VARCHAR con éxito.");
    } catch (e) {
        console.error(e);
    } finally {
        await pool.end();
    }
}
check();
