import { pool } from './src/config/db.js';

async function migrateAvisosTable() {
    console.log("Iniciando migración de la tabla AVISOS a formato UUID-SaaS...");
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        console.log("1. Eliminando FK temporalmente...");
        await client.query('ALTER TABLE avisos_empleados DROP CONSTRAINT IF EXISTS avisos_empleados_aviso_id_fkey');

        console.log("2. Expandiendo columna ID en 'avisos' de VARCHAR(8) a VARCHAR(50)...");
        await client.query('ALTER TABLE avisos ALTER COLUMN id TYPE VARCHAR(50)');

        console.log("3. Expandiendo columna aviso_id en 'avisos_empleados' de VARCHAR(8) a VARCHAR(50)...");
        await client.query('ALTER TABLE avisos_empleados ALTER COLUMN aviso_id TYPE VARCHAR(50)');

        console.log("4. Restaurando FK...");
        await client.query(`
            ALTER TABLE avisos_empleados 
            ADD CONSTRAINT avisos_empleados_aviso_id_fkey 
            FOREIGN KEY (aviso_id) REFERENCES avisos(id) ON DELETE CASCADE
        `);

        await client.query('COMMIT');
        console.log("¡Migración completada con éxito! La tabla Avisos ahora soporta el nuevo formato SaaS.");
    } catch (e) {
        await client.query('ROLLBACK');
        console.error("Error durante la migración:", e);
    } finally {
        client.release();
        process.exit(0);
    }
}

migrateAvisosTable();
