
import { pool } from './src/config/db.js';

async function checkData() {
    try {
        // Check variables de entorno
        console.log('DB_HOST:', process.env.DB_HOST);
        console.log('DB_USER:', process.env.DB_USER);
        console.log('DB_NAME:', process.env.DB_NAME);

        const res = await pool.query('SELECT NOW()');
        console.log('✅ Conectado a la base de datos PostgreSQL');
        console.log('Hora del servidor:', res.rows[0].now);

        const roles = await pool.query('SELECT * FROM roles');
        console.log('Roles found:', roles.rows.length);

        const toleranciasSchema = await pool.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'tolerancias';
`);
        console.table(toleranciasSchema.rows);

        // Check columns of asistencias table
        console.log('\n--- Estructura de tabla asistencias ---');
        const columns = await pool.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'asistencias';
        `);
        console.table(columns.rows);

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
