import logger from '../utils/logger.js';
import { sendError } from '../utils/response.js';

export const errorHandler = (err, req, res, next) => {
    logger.error('Error no controlado:', err);

    if (res.headersSent) {
        return next(err);
    }

    // Errores operacionales conocidos podrían manejarse aquí específicamente

    sendError(res, 'Ocurrió un error inesperado en el servidor', 500, err);
};
