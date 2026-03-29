import { pool } from './src/config/db.js';
import bcrypt from 'bcrypt';

async function verifyDynamic() {
    try {
        console.log('--- Dynamic Verification Starting ---');
        
        // 1. Save original configs for all
        const originalConfigs = await pool.query('SELECT id, intentos_maximos, cooldown_bloqueo FROM configuraciones');
        console.log(`Working with ${originalConfigs.rows.length} configurations.`);

        // 2. Update ALL configs to test values to avoid fallback issues
        console.log('Updating ALL configs for test: Max=3, Cooldown=5s');
        await pool.query('UPDATE configuraciones SET intentos_maximos = 3, cooldown_bloqueo = 5');

        // 3. Create test user
        const testUserId = 'test-dynamic-' + Date.now();
        const hashedPassword = await bcrypt.hash('password123', 10);
        await pool.query(`
            INSERT INTO usuarios (id, usuario, correo, contraseña, nombre, estado_cuenta, empresa_id)
            VALUES ($1, $2, $3, $4, $5, 'activo', 'MASTER')
        `, [testUserId, 'test_dynamic', 'test_dyn@example.com', hashedPassword, 'Test Dynamic']);

        const { login } = await import('./src/controllers/auth.controller.js');
        const mockRes = () => {
            const res = {};
            res.status = (code) => { res.statusCode = code; return res; };
            res.json = (data) => { res.data = data; return res; };
            return res;
        };

        // 4. Simulate 3 failed attempts
        console.log('Simulating 3 failed attempts...');
        for (let i = 1; i <= 3; i++) {
            const req = { body: { usuario: 'test_dynamic', contraseña: 'wrong' } };
            const res = mockRes();
            await login(req, res);
            console.log(`Attempt ${i}: Status ${res.statusCode}, Message: ${res.data.message}`);
        }

        // 5. Verify block
        console.log('Testing block immediately after 3 failures...');
        const reqBlocked = { body: { usuario: 'test_dynamic', contraseña: 'password123' } };
        const resBlocked = mockRes();
        await login(reqBlocked, resBlocked);
        console.log(`Blocked Attempt Status: ${resBlocked.statusCode}, Message: ${resBlocked.data.message}`);

        // 6. Wait 6 seconds and try again
        console.log('Waiting 6 seconds for cooldown...');
        await new Promise(resolve => setTimeout(resolve, 6000));

        console.log('Testing login after cooldown...');
        const reqAfter = { body: { usuario: 'test_dynamic', contraseña: 'password123' } };
        const resAfter = mockRes();
        await login(reqAfter, resAfter);
        console.log(`After Cooldown Status: ${resAfter.statusCode}, Message: ${resAfter.data.message}`);

        // 7. Restore original configs and cleanup
        console.log('Restoring original configs and cleaning up...');
        for (const config of originalConfigs.rows) {
            await pool.query('UPDATE configuraciones SET intentos_maximos = $1, cooldown_bloqueo = $2 WHERE id = $3', 
                [config.intentos_maximos, config.cooldown_bloqueo, config.id]);
        }
        await pool.query('DELETE FROM usuarios WHERE id = $1', [testUserId]);

        console.log('--- Dynamic Verification Finished ---');
        process.exit(0);
    } catch (err) {
        console.error('❌ Error during verification:', err);
        process.exit(1);
    }
}

verifyDynamic();
