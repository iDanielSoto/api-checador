import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'checador-fas',
    password: 'Minions090405',
    port: 5432,
});

async function addSegmentosRedColumn() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        console.log("Añadiendo columna segmentos_red a la tabla configuraciones...");

        await client.query(`
            ALTER TABLE configuraciones 
            ADD COLUMN IF NOT EXISTS segmentos_red JSONB DEFAULT '[]'::jsonb
        `);

        console.log("Columna agregada exitosamente.");

        await client.query('COMMIT');
    } catch (e) {
        await client.query('ROLLBACK');
        console.error("Error al añadir la columna:", e);
    } finally {
        client.release();
        process.exit(0);
    }
}

addSegmentosRedColumn();
