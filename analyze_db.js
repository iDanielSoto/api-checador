import { pool } from './src/config/db.js';

async function main() {
    try {
        console.log("=== Tablas en la Base de Datos ===");
        const tablesRes = await pool.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            ORDER BY table_name;
        `);
        const tables = tablesRes.rows.map(r => r.table_name);
        console.log(tables.join(', '));

        console.log("\n=== Columnas 'empresa_id' encontradas en las tablas ===");
        const columnsRes = await pool.query(`
            SELECT table_name, column_name, data_type 
            FROM information_schema.columns 
            WHERE table_schema = 'public' AND column_name LIKE '%empresa%'
            ORDER BY table_name;
        `);
        columnsRes.rows.forEach(r => {
            console.log(`- ${r.table_name}.${r.column_name} (${r.data_type})`);
        });

        console.log("\n=== Evaluando si hay tabla de Empresas ===");
        if (tables.includes('empresas')) {
            const empresaColumns = await pool.query(`
                SELECT column_name, data_type 
                FROM information_schema.columns 
                WHERE table_name = 'empresas';
             `);
            console.log("Tabla 'empresas' encontrada con columnas:");
            empresaColumns.rows.forEach(r => console.log(`  * ${r.column_name} (${r.data_type})`));
        } else {
            console.log("NO se encontró tabla 'empresas' o similar (como clientes, compañias).");
        }

    } catch (err) {
        console.error("Error:", err);
    } finally {
        await pool.end();
    }
}

main();
