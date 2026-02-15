import winston from 'winston';
import dotenv from 'dotenv';
dotenv.config();

const { combine, timestamp, printf, colorize, errors } = winston.format;

// Formato personalizado para consola
const logFormat = printf(({ level, message, timestamp, stack }) => {
    return `${timestamp} ${level}: ${stack || message}`;
});

const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: combine(
        timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        errors({ stack: true }), // Manejo de errores con stack trace
        process.env.NODE_ENV === 'production' ? winston.format.json() : winston.format.simple()
    ),
    transports: [
        // Escribir todos los logs con nivel `error` o menor a `error.log`
        new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
        // Escribir todos los logs a `combined.log`
        new winston.transports.File({ filename: 'logs/combined.log' }),
    ],
});

// Si no estamos en producción, loguear a la consola con formato simple
if (process.env.NODE_ENV !== 'production') {
    logger.add(new winston.transports.Console({
        format: combine(
            colorize(),
            logFormat
        ),
    }));
}

export default logger;
