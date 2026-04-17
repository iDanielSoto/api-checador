import 'dotenv/config';
import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

async function cleanup() {
    try {
        console.log('--- Eliminando tablas obsoletas ---');
        await pool.query('DROP TABLE IF EXISTS permisos_catalogo CASCADE');
        await pool.query('DROP TABLE IF EXISTS modulos CASCADE');
        console.log('--- Tablas eliminadas con éxito ---');
    } catch (err) {
        console.error('Error durante la limpieza:', err);
    } finally {
        await pool.end();
    }
}

cleanup();
