import { HTTP_STATUS } from '../config/constants.js';

export const sendSuccess = (res, data, message = 'Operación exitosa', statusCode = HTTP_STATUS.OK) => {
    return res.status(statusCode).json({
        success: true,
        message,
        data
    });
};

export const sendError = (res, message = 'Error interno del servidor', statusCode = HTTP_STATUS.INTERNAL_SERVER_ERROR, error = null) => {
    const response = {
        success: false,
        message
    };

    if (error && process.env.NODE_ENV !== 'production') {
        response.error = error.message || error;
        response.stack = error.stack;
    }

    return res.status(statusCode).json(response);
};
