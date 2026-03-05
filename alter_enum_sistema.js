
import { pool } from './src/config/db.js';

async function check() {
    try {
        await pool.query(`ALTER TYPE tipo_dispositivo_origen ADD VALUE IF NOT EXISTS 'sistema';`);
        console.log("Añadido 'sistema' al ENUM tipo_dispositivo_origen");
    } catch (e) {
        console.error(e);
    } finally {
        await pool.end();
    }
}
check();
