
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
        console.log("Checking columns in 'configuraciones'...");
        const resCol = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'configuraciones' AND column_name = 'requiere_salida';
    `);

        if (resCol.rows.length === 0) {
            console.log("Adding 'requiere_salida' to 'configuraciones'...");
            await pool.query("ALTER TABLE configuraciones ADD COLUMN requiere_salida BOOLEAN DEFAULT TRUE;");
        } else {
            console.log("'requiere_salida' column already exists.");
        }

        console.log("Checking enum 'estado_asistencia'...");
        const resEnum = await pool.query(`
      SELECT enumlabel 
      FROM pg_enum 
      JOIN pg_type ON pg_enum.enumtypid = pg_type.oid 
      WHERE typname = 'estado_asistencia' AND enumlabel = 'salida_no_cumplida';
    `);

        if (resEnum.rows.length === 0) {
            console.log("Adding 'salida_no_cumplida' to enum 'estado_asistencia'...");
            // In PostgreSQL, ALTER TYPE ... ADD VALUE cannot be executed inside a transaction block in some versions
            // but here we are using pg pool which might be fine depending on the context.
            await pool.query("ALTER TYPE estado_asistencia ADD VALUE 'salida_no_cumplida';");
        } else {
            console.log("'salida_no_cumplida' value already exists in enum.");
        }

        console.log("Success!");
    } catch (err) {
        console.error("Error during migration:", err);
    } finally {
        await pool.end();
    }
}

run();
