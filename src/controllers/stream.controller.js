import { addClient } from '../utils/sse.js';
import { pool } from '../config/db.js';

/**
 * GET /api/stream
 * Centralized SSE endpoint for all real-time notifications
 * Authenticates via query token
 */
export async function streamEvents(req, res) {
    const { token } = req.query;

    if (!token) {
        return res.status(401).json({ success: false, message: 'Token requerido' });
    }

    // Bypass temporal o definitivo para administradores de la red (Tokens de Saas)
    if (token.startsWith('saas_')) {
        addClient(res);
        return;
    }

    // Verify token/user
    try {
        const resultado = await pool.query(
            "SELECT id FROM usuarios WHERE id = $1 AND estado_cuenta = 'activo'",
            [token]
        );

        if (resultado.rows.length === 0) {
            return res.status(401).json({ success: false, message: 'Token inválido' });
        }
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Error de autenticación' });
    }

    addClient(res);
}
