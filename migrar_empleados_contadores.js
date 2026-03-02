import 'dotenv/config';
import { pool } from './src/config/db.js';

async function migrate() {
    console.log('Iniciando migración de empleados (contadores)...');
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        await client.query(`ALTER TABLE empleados ADD COLUMN IF NOT EXISTS contadores JSONB DEFAULT '{}'::jsonb`);

        // Mover los contadores existentes al jsonb
        const res = await client.query('SELECT id, contador_retardos_a, contador_retardos_b FROM empleados');
        for (const emp of res.rows) {
            const contadores = {};
            if (emp.contador_retardos_a) contadores['retardo_a'] = emp.contador_retardos_a;
            if (emp.contador_retardos_b) contadores['retardo_b'] = emp.contador_retardos_b;

            await client.query('UPDATE empleados SET contadores = $1 WHERE id = $2', [JSON.stringify(contadores), emp.id]);
        }

        // Opcional: Eliminar columas viejas
        await client.query('ALTER TABLE empleados DROP COLUMN IF EXISTS contador_retardos_a, DROP COLUMN IF EXISTS contador_retardos_b');

        await client.query('COMMIT');
        console.log('Migración completada exitosamente.');

    } catch (e) {
        await client.query('ROLLBACK');
        console.error('Error durante la migración:', e);
    } finally {
        client.release();
        process.exit(0);
    }
}

migrate();
