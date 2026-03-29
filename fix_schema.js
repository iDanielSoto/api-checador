import { pool } from './src/config/db.js';

async function fixSchema() {
    try {
        console.log('--- Adding cooldown_bloqueo to configuraciones ---');
        await pool.query('ALTER TABLE configuraciones ADD COLUMN IF NOT EXISTS cooldown_bloqueo INTEGER DEFAULT 1800');
        console.log('✅ Success!');
        process.exit(0);
    } catch (err) {
        console.error('❌ Error:', err);
        process.exit(1);
    }
}

fixSchema();
