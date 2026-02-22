import { sendError } from '../utils/response.js';
import { logSystemEvent, LOG_LEVELS } from '../utils/logger.js';

export const errorHandler = async (err, req, res, next) => {
    console.error('Error no controlado por Express:', err);

    // Intentar registrar en BD para el SaaS Dashboard
    await logSystemEvent({
        nivel: LOG_LEVELS.ERROR,
        mensaje: err.message || 'Error Interno del Servidor',
        contexto: {
            stack: err.stack,
            body: req.body,
            query: req.query,
            params: req.params,
            method: req.method
        },
        ruta: req.originalUrl,
        empresa_id: req.empresa_id || req.user?.empresa_id || null
    });

    if (res.headersSent) {
        return next(err);
    }

    sendError(res, 'Ocurrió un error inesperado en el servidor', 500, err);
};
