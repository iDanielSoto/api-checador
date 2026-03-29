import { pool } from './src/config/db.js';

async function migrate() {
    try {
        console.log('--- Applying migrations ---');
        
        // 1. Add 'bloqueado' to tipo_estado_cuenta if it doesn't exist
        const enumCheck = await pool.query(`
            SELECT enumlabel 
            FROM pg_enum 
            JOIN pg_type ON pg_enum.enumtypid = pg_type.oid 
            WHERE pg_type.typname = 'tipo_estado_cuenta' AND enumlabel = 'bloqueado'
        `);
        
        if (enumCheck.rows.length === 0) {
            console.log('Adding "bloqueado" to tipo_estado_cuenta enum...');
            await pool.query("ALTER TYPE tipo_estado_cuenta ADD VALUE 'bloqueado'");
        } else {
            console.log('"bloqueado" value already exists in enum.');
        }

        // 2. Add intentos_fallidos column if it doesn't exist
        console.log('Checking for intentos_fallidos column...');
        await pool.query(`
            DO $$ 
            BEGIN 
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='usuarios' AND column_name='intentos_fallidos') THEN
                    ALTER TABLE usuarios ADD COLUMN intentos_fallidos INTEGER DEFAULT 0;
                END IF;
            END $$;
        `);

        // 3. Add bloqueado_hasta column if it doesn't exist
        console.log('Checking for bloqueado_hasta column...');
        await pool.query(`
            DO $$ 
            BEGIN 
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='usuarios' AND column_name='bloqueado_hasta') THEN
                    ALTER TABLE usuarios ADD COLUMN bloqueado_hasta TIMESTAMP DEFAULT NULL;
                END IF;
            END $$;
        `);

        console.log('✅ Migrations applied successfully');
        process.exit(0);
    } catch (err) {
        console.error('❌ Error applying migrations:', err);
        process.exit(1);
    }
}

migrate();
