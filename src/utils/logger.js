import winston from 'winston';
import dotenv from 'dotenv';
import { pool } from '../config/db.js';
import { generateId, ID_PREFIXES } from './idGenerator.js';

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

export const LOG_LEVELS = {
    INFO: 'info',
    WARN: 'warn',
    ERROR: 'error',
    CRITICAL: 'critical'
};

/**
 * Guarda un registro de evento en la tabla global del sistema (system_logs).
 * Retorna true si tuvo éxito o false si falló para no detener la ejecución principal.
 */
export async function logSystemEvent({ nivel = LOG_LEVELS.INFO, mensaje, contexto = null, ruta = null, empresa_id = null }) {
    try {
        if (!mensaje || mensaje.trim() === '') {
            return false;
        }

        const logId = await generateId(ID_PREFIXES.LOG);

        await pool.query(`
            INSERT INTO system_logs (id, nivel, mensaje, contexto, ruta, empresa_id)
            VALUES ($1, $2, $3, $4, $5, $6)
        `, [
            logId,
            nivel,
            mensaje.substring(0, 1000),
            contexto ? JSON.stringify(contexto) : null,
            ruta ? ruta.substring(0, 255) : null,
            empresa_id
        ]);

        return true;
    } catch (err) {
        console.error('CRITICAL: Falló el logger de Base de Datos:', err);
        return false;
    }
}

export default logger;
