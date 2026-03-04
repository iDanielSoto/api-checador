
import { pool } from './src/config/db.js';

async function listColumns(tableName) {
    const res = await pool.query(`
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_name = $1
        ORDER BY column_name;
    `, [tableName]);
    console.log(`\nColumns for table '${tableName}':`);
    res.rows.forEach(row => {
        console.log(`- ${row.column_name} (${row.data_type})`);
    });
}

async function run() {
    try {
        await listColumns('empresas');
        await listColumns('configuraciones');
        await listColumns('tolerancias');
    } catch (err) {
        console.error(err);
    } finally {
        await pool.end();
    }
}

run();
