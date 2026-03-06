import { pool } from './src/config/db.js';

async function findAllVarchar8() {
    const client = await pool.connect();
    try {
        console.log("--- TODAS LAS COLUMNAS VARCHAR(8) EN LA BD ---");
        const res = await client.query(`
            SELECT table_name, column_name, data_type, character_maximum_length 
            FROM information_schema.columns 
            WHERE table_schema = 'public' 
            AND character_maximum_length = 8;
        `);
        for (let r of res.rows) {
            console.log(`Tabla: ${r.table_name}, Columna: ${r.column_name}`);
        }

        console.log("--- TRIGGERS EN LA TABLA AVISOS ---");
        const triggers = await client.query(`
            SELECT trigger_name, event_manipulation, event_object_table, action_statement
            FROM information_schema.triggers
            WHERE event_object_table = 'avisos';
        `);
        for (let t of triggers.rows) {
            console.log(`Trigger: ${t.trigger_name} en ${t.event_manipulation} -> ${t.action_statement}`);
        }

        console.log("--- TERMINADO ---");
    } catch (e) {
        console.error("ERROR CRÍTICO:", e);
    } finally {
        client.release();
        process.exit();
    }
}

findAllVarchar8();
