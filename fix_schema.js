
import { pool } from './src/config/db.js';

async function fixSchema() {
    try {
        console.log("Checking columns length...");
        const res = await pool.query(`
            SELECT column_name, data_type, character_maximum_length 
            FROM information_schema.columns 
            WHERE table_name = 'empresas' AND column_name IN ('correo', 'telefono');
        `);
        console.log(JSON.stringify(res.rows, null, 2));

        console.log("Fixing columns for 'empresas' table...");
        await pool.query("ALTER TABLE empresas ALTER COLUMN correo TYPE VARCHAR(255);");
        await pool.query("ALTER TABLE empresas ALTER COLUMN telefono TYPE VARCHAR(50);");

        console.log("Successfully updated columns.");

        const res2 = await pool.query(`
            SELECT column_name, data_type, character_maximum_length 
            FROM information_schema.columns 
            WHERE table_name = 'empresas' AND column_name IN ('correo', 'telefono');
        `);
        console.log(JSON.stringify(res2.rows, null, 2));

    } catch (err) {
        console.error("Error fixing schema:", err);
    } finally {
        await pool.end();
    }
}

fixSchema();
