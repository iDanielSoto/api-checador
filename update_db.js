import { pool } from './src/config/db.js';

async function main() {
    try {
        console.log("1. Agregando columnas a la tabla empleados...");
        await pool.query(`
            ALTER TABLE empleados
            ADD COLUMN IF NOT EXISTS contador_retardos_a INT DEFAULT 0,
            ADD COLUMN IF NOT EXISTS contador_retardos_b INT DEFAULT 0;
        `);
        console.log("Columnas agregadas (o ya existían).");

        console.log("\n2. Revisando el tipo de dato de la columna 'estado' en la tabla 'asistencias'...");
        const res = await pool.query(`
            SELECT data_type, udt_name 
            FROM information_schema.columns 
            WHERE table_name = 'asistencias' AND column_name = 'estado';
        `);

        if (res.rows.length > 0) {
            const row = res.rows[0];
            console.log(`Tipo de columna 'estado': data_type='${row.data_type}', udt_name='${row.udt_name}'`);

            if (row.data_type === 'USER-DEFINED') {
                console.log(`\nEs un ENUM tipo '${row.udt_name}'. Intentando agregar los nuevos valores (ignorará si ya existen)...`);

                const addEnumValue = async (val) => {
                    try {
                        await pool.query(`ALTER TYPE ${row.udt_name} ADD VALUE '${val}'`);
                        console.log(`[EXITO] Valor '${val}' agregado a '${row.udt_name}'.`);
                    } catch (e) {
                        console.log(`[AVISO] No se pudo agregar '${val}' a '${row.udt_name}' (posiblemente ya existe): ${e.message}`);
                    }
                }

                // Si PostgreSQL lanza error, aborta toda la transacción y el pool, así que mejor no los agrupo en Promise.all
                // Además no se puede ejecutar un ALTER TYPE en un bloque transaccional a veces, así que vamos una a una.
                // Y si falla altera el pool permanentemente, pero es un script auto-contenido.
                // En realidad un error en ALTER TYPE no aborta las siguientes operaciones de pool si hacemos try-catch, excepto que estemos en un BEGIN
                await addEnumValue('retardo_a');
                await addEnumValue('retardo_b');
                await addEnumValue('falta_por_retardo');

            } else {
                console.log("\nNo es un ENUM (probablemente VARCHAR o TEXT). Revisando si hay un CHECK constraint...");
                const checks = await pool.query(`
                    SELECT con.conname, pg_get_constraintdef(con.oid) AS definicion
                    FROM pg_catalog.pg_constraint con
                    INNER JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
                    WHERE rel.relname = 'asistencias' AND con.contype = 'c';
                `);

                if (checks.rows.length > 0) {
                    console.log("Constraints encontradas en 'asistencias':");
                    checks.rows.forEach(c => console.log(` - ${c.conname}: ${c.definicion}`));
                } else {
                    console.log("No se encontraron CHECK constraints en la tabla 'asistencias'.");
                }
            }
        } else {
            console.log("\nNo se encontró la columna 'estado' en la tabla 'asistencias'.");
        }
    } catch (err) {
        console.error("Error global:", err);
    } finally {
        await pool.end();
    }
}

main();
