
import { pool } from './src/config/db.js';

async function forceAddColumn() {
    try {
        console.log('Attempting to add tipo column...');

        try {
            await pool.query(`
                ALTER TABLE asistencias 
                ADD COLUMN tipo VARCHAR(20) DEFAULT 'entrada';
            `);
            console.log('✅ Column tipo added successfully.');
        } catch (err) {
            if (err.code === '42701') { // duplicate_column
                console.log('⚠️ Column tipo already exists (caught error 42701).');
            } else {
                console.error('❌ Error adding column:', err.message);
            }
        }

        console.log('Verifying column existence...');
        try {
            const res = await pool.query('SELECT tipo FROM asistencias LIMIT 1');
            console.log('✅ SELECT tipo worked. Column exists.');
        } catch (err) {
            console.error('❌ SELECT tipo failed:', err.message);
        }

    } catch (err) {
        console.error('Global error:', err);
    } finally {
        await pool.end();
    }
}

forceAddColumn();
