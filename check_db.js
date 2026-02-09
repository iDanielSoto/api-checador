
import { pool } from './src/config/db.js';

async function checkData() {
    try {
        const roles = await pool.query('SELECT * FROM roles');
        console.log('Roles found:', roles.rows.length);

        const toleranciasSchema = await pool.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'tolerancias';
`);
        console.table(toleranciasSchema.rows);

        const checkTolerancias = await pool.query('SELECT * FROM tolerancias');
        console.log('Tolerancias count:', checkTolerancias.rowCount);

        console.table(roles.rows);

        const usuarios = await pool.query('SELECT id, usuario, nombre, es_empleado FROM usuarios');
        console.log('Users found:', usuarios.rows.length);
        console.table(usuarios.rows);
    } catch (err) {
        console.error(err);
    } finally {
        await pool.end();
    }
}

checkData();
