import { addClient } from '../utils/sse.js';
import { pool } from '../config/db.js';
import jwt from 'jsonwebtoken';

/**
 * GET /api/stream
 * Centralized SSE endpoint for all real-time notifications
 * Authenticates via query token (JWT o userId directo)
 */
export async function streamEvents(req, res) {
    const { token } = req.query;

    if (!token) {
        return res.status(401).json({ success: false, message: 'Token requerido' });
    }

    // Bypass para tokens SaaS
    if (token.startsWith('saas_')) {
        addClient(res);
        return;
    }

    try {
        // Decodificar JWT para obtener el userId real
        let userId = token;
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET || 'default_secret');
            userId = decoded.sub;
        } catch {
            // No es JWT válido, tratar como userId directo (legacy)
            userId = token;
        }

        const resultado = await pool.query(
            "SELECT id FROM usuarios WHERE id = $1 AND estado_cuenta = 'activo'",
            [userId]
        );

        if (resultado.rows.length === 0) {
            return res.status(401).json({ success: false, message: 'Token inválido' });
        }

        addClient(res);
    } catch (error) {
        console.error('Error en SSE stream:', error);
        return res.status(500).json({ success: false, message: 'Error de autenticación' });
    }
}
