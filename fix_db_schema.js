import { pool } from './src/config/db.js';

async function fixDatabase() {
    try {
        console.log('Iniciando diagnóstico y corrección de BD...');

        // 1. Create sequence
        try {
            console.log('Creando secuencia seq_avisos...');
            await pool.query('CREATE SEQUENCE IF NOT EXISTS seq_avisos');
            console.log('Secuencia creada (o ya existía).');
        } catch (e) {
            console.error('Error creando secuencia:', e);
        }

        // 2. Check and fix ID column type
        try {
            console.log('Verificando tipo de columna id en avisos...');
            const res = await pool.query(`
                SELECT data_type 
                FROM information_schema.columns 
                WHERE table_name = 'avisos' AND column_name = 'id'
            `);

            if (res.rows.length > 0) {
                const currentType = res.rows[0].data_type;
                console.log(`Tipo actual: ${currentType}`);

                if (currentType !== 'character varying' && currentType !== 'text' && currentType !== 'character') {
                    console.log('Cambiando tipo de columna id a VARCHAR(20)...');
                    // We might need to drop default if it was serial
                    await pool.query('ALTER TABLE avisos ALTER COLUMN id DROP DEFAULT');
                    // Cast existing IDs if possible, or just force it. 
                    await pool.query('ALTER TABLE avisos ALTER COLUMN id TYPE VARCHAR(20) USING id::varchar');
                    console.log('Columna alterada.');
                } else {
                    console.log('El tipo de columna ya es correcto.');
                }
            } else {
                console.error('La tabla avisos no existe?');
            }
        } catch (e) {
            console.error('Error alterando tabla:', e);
        }

    } catch (error) {
        console.error('Error general:', error);
    } finally {
        await pool.end();
    }
}

fixDatabase();
