import { pool } from './src/config/db.js';
import bcrypt from 'bcrypt';

async function updatePassword() {
    try {
        const hash = await bcrypt.hash('admin123', 10);
        await pool.query('UPDATE super_administradores SET contraseña = $1 WHERE usuario = $2', [hash, 'admin_saas']);
        console.log('Contraseña de admin_saas actualizada a: admin123');
    } catch (error) {
        console.error('Error:', error);
    } finally {
        await pool.end();
        process.exit(0);
    }
}
updatePassword();
