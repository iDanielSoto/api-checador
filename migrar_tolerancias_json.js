import 'dotenv/config';
import { pool } from './src/config/db.js';

async function migrate() {
    console.log('Iniciando migración de tolerancias...');
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // 1. Crear columna JSONB
        await client.query(`ALTER TABLE tolerancias ADD COLUMN IF NOT EXISTS reglas JSONB DEFAULT '[]'::jsonb`);

        // 2. Obtener todas las tolerancias existentes
        const res = await client.query('SELECT * FROM tolerancias');

        for (const tol of res.rows) {
            // Solo migrar si no hay reglas
            if (!tol.reglas || tol.reglas.length === 0) {
                const reglas = [
                    { id: 'puntual', limite_minutos: tol.minutos_retardo ?? 10 },
                    {
                        id: 'retardo_a',
                        limite_minutos: tol.minutos_retardo_a_max ?? 20,
                        penalizacion_tipo: 'acumulacion',
                        penalizacion_valor: tol.equivalencia_retardo_a ?? 10,
                        aplica_falta: true
                    },
                    {
                        id: 'retardo_b',
                        limite_minutos: tol.minutos_retardo_b_max ?? 29,
                        penalizacion_tipo: 'acumulacion',
                        penalizacion_valor: tol.equivalencia_retardo_b ?? 5,
                        aplica_falta: true
                    },
                    {
                        id: 'falta_directa',
                        limite_minutos: tol.minutos_falta ?? 30,
                        penalizacion_tipo: 'falta',
                        penalizacion_valor: 1
                    }
                ];

                await client.query('UPDATE tolerancias SET reglas = $1 WHERE id = $2', [JSON.stringify(reglas), tol.id]);
            }
        }

        // 3. Opcional: Eliminar las columnas viejas
        await client.query(`
            ALTER TABLE tolerancias 
            DROP COLUMN IF EXISTS minutos_retardo,
            DROP COLUMN IF EXISTS minutos_falta,
            DROP COLUMN IF EXISTS minutos_retardo_a_max,
            DROP COLUMN IF EXISTS minutos_retardo_b_max,
            DROP COLUMN IF EXISTS equivalencia_retardo_a,
            DROP COLUMN IF EXISTS equivalencia_retardo_b
        `);

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
