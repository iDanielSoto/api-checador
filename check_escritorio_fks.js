import { pool } from './src/config/db.js';

async function checkFKs() {
    try {
        const query = `
            SELECT
                tc.table_name, kcu.column_name,
                ccu.table_name AS foreign_table_name,
                ccu.column_name AS foreign_column_name,
                rc.delete_rule
            FROM information_schema.table_constraints AS tc
            JOIN information_schema.key_column_usage AS kcu
              ON tc.constraint_name = kcu.constraint_name
              AND tc.table_schema = kcu.table_schema
            JOIN information_schema.constraint_column_usage AS ccu
              ON ccu.constraint_name = tc.constraint_name
              AND ccu.table_schema = tc.table_schema
            JOIN information_schema.referential_constraints AS rc
              ON rc.constraint_name = tc.constraint_name
            WHERE ccu.table_name = 'escritorio';
        `;
        const result = await pool.query(query);
        console.log("Tablas que apuntan a 'escritorio':");
        console.table(result.rows);
    } catch (e) {
        console.error(e);
    } finally {
        await pool.end();
    }
}
checkFKs();
