
import pkg from 'pg';
import dotenv from 'dotenv';
const { Pool } = pkg;
dotenv.config();

const pool = new Pool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT,
});

async function research() {
    try {
        const res = await pool.query(`
            SELECT nombre, empresa_id, COUNT(*) 
            FROM departamentos 
            GROUP BY nombre, empresa_id 
            HAVING COUNT(*) > 1
        `);
        console.log("Duplicados exactos:", res.rows);
        
        const res2 = await pool.query(`
            SELECT TRIM(nombre) as n, empresa_id, COUNT(*) 
            FROM departamentos 
            GROUP BY n, empresa_id 
            HAVING COUNT(*) > 1
        `);
        console.log("Duplicados con trim:", res2.rows);

    } catch (err) {
        console.error(err);
    } finally {
        await pool.end();
    }
}
research();
