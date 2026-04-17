import pool from '../src/config/db.js';

async function migrate() {
    console.log('Iniciando migración de comandos para escritorio...');
    try {
        await pool.query(`
            ALTER TABLE escritorio 
            ADD COLUMN IF NOT EXISTS comando_kiosko VARCHAR(50) DEFAULT 'none';
        `);
        console.log('Columna comando_kiosko verificada/creada exitosamente.');

        await pool.query(`
            ALTER TABLE escritorio 
            ADD COLUMN IF NOT EXISTS comando_watchdog VARCHAR(50) DEFAULT 'none';
        `);
        console.log('Columna comando_watchdog verificada/creada exitosamente.');
        
    } catch (error) {
        console.error('Error durante la migración:', error);
    } finally {
        pool.end();
        console.log('Migración finalizada.');
    }
}

migrate();
