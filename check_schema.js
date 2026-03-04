
import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'checador-fas',
    password: 'Minions090405',
    port: 5432,
});

async function run() {
    try {
        console.log("Checking structure of 'asistencias' table...");
        const res = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'asistencias' AND column_name = 'estado';
    `);
        console.log("Estado column type:", res.rows[0]?.data_type);

        // Check for check constraints on the 'estado' column
        const constraints = await pool.query(`
      SELECT conname, pg_get_constraintdef(c.oid)
      FROM pg_constraint c
      JOIN pg_namespace n ON n.oid = c.connamespace
      WHERE conrelid = 'asistencias'::regclass AND contype = 'c';
    `);
        console.log("Constraints:", constraints.rows);

        // Check existing values for state just in case it's an enum
        const enumQuery = await pool.query(`
        SELECT typname, enumlabel
        FROM pg_enum
        JOIN pg_type ON pg_enum.enumtypid = pg_type.oid
        WHERE typname = 'asistencia_estado' OR typname = 'estado_asistencia';
    `);
        console.log("Enum values:", enumQuery.rows);

    } catch (err) {
        console.error("Error:", err);
    } finally {
        await pool.end();
    }
}

run();
