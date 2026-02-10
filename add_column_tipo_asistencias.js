
import { pool } from './src/config/db.js';

async function addTipoColumn() {
    try {
        console.log('Adding tipo column to asistencias table...');

        // Check if column exists first
        const check = await pool.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'asistencias' AND column_name = 'tipo'
        `);

        if (check.rows.length === 0) {
            await pool.query(`
                ALTER TABLE asistencias 
                ADD COLUMN tipo VARCHAR(20) DEFAULT 'entrada';
            `);
            console.log('Column tipo added successfully.');
        } else {
            console.log('Column tipo already exists.');
        }

    } catch (err) {
        console.error('Error adding column:', err);
    } finally {
        await pool.end();
    }
}

addTipoColumn();
