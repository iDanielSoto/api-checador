import { pool } from './src/config/db.js';
import bcrypt from 'bcrypt';

async function verify() {
    try {
        console.log('--- Verification Starting ---');
        
        // 1. Create a test user
        const testUserId = 'test-proteccion-' + Date.now();
        const hashedPassword = await bcrypt.hash('password123', 10);
        
        console.log('Creating test user...');
        await pool.query(`
            INSERT INTO usuarios (id, usuario, correo, contraseña, nombre, estado_cuenta, empresa_id)
            VALUES ($1, $2, $3, $4, $5, 'activo', 'MASTER')
        `, [testUserId, 'test_user_prot', 'test@example.com', hashedPassword, 'Test User Prot']);

        const { login } = await import('./src/controllers/auth.controller.js');
        
        const mockRes = () => {
            const res = {};
            res.status = (code) => {
                res.statusCode = code;
                return res;
            };
            res.json = (data) => {
                res.data = data;
                return res;
            };
            return res;
        };

        // 2. Simulate 5 failed attempts
        console.log('Simulating 5 failed attempts...');
        for (let i = 1; i <= 5; i++) {
            const req = { body: { usuario: 'test_user_prot', contraseña: 'wrongpassword' } };
            const res = mockRes();
            await login(req, res);
            console.log(`Attempt ${i}: Status ${res.statusCode}, Message: ${res.data.message}`);
        }

        // 3. Verify user is blocked in DB
        console.log('Verifying user status in DB...');
        const userRes = await pool.query('SELECT estado_cuenta, intentos_fallidos, bloqueado_hasta FROM usuarios WHERE id = $1', [testUserId]);
        console.log('DB State:', JSON.stringify(userRes.rows[0], null, 2));

        if (userRes.rows[0].estado_cuenta === 'bloqueado' && userRes.rows[0].intentos_fallidos === 5) {
            console.log('✅ Account successfully blocked!');
        } else {
            console.error('❌ Account NOT blocked correctly');
        }

        // 4. Test login attempt while blocked
        console.log('Testing login attempt while blocked...');
        const blockedReq = { body: { usuario: 'test_user_prot', contraseña: 'password123' } };
        const blockedRes = mockRes();
        await login(blockedReq, blockedRes);
        console.log(`Status ${blockedRes.statusCode}, Message: ${blockedRes.data.message}`);

        // 5. Unblock manually for further testing if needed, or just cleanup
        console.log('Cleanup: Deleting test user');
        await pool.query('DELETE FROM usuarios WHERE id = $1', [testUserId]);

        console.log('--- Verification Finished ---');
        process.exit(0);
    } catch (err) {
        console.error('❌ Verification Error:', err);
        process.exit(1);
    }
}

verify();
