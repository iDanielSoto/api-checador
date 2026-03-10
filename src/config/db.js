import pkg from 'pg';
import dotenv from 'dotenv';
const { Pool } = pkg;
dotenv.config();

import logger from '../utils/logger.js';

// Configura la conexión a PostgreSQL
export const pool = new Pool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT,
    // Descartar conexiones idle antes de que el servidor las corte
    idleTimeoutMillis: 30000,
    // Mantener viva la conexión TCP para evitar ECONNRESET por inactividad
    keepAlive: true,
    keepAliveInitialDelayMillis: 10000,
});

// CRÍTICO: capturar errores en clientes idle para evitar que el proceso crashee
// (ocurre cuando PostgreSQL cierra la conexión mientras está en el pool)
pool.on('error', (err, client) => {
    logger.error('⚠️ Error inesperado en cliente idle del pool de BD:', err.message);
    // No re-lanzar — el pool descartará ese cliente y creará uno nuevo cuando sea necesario
});

// Verificación de conexión
pool.connect()
    .then(client => {
        logger.info('✅ Conectado a la base de datos PostgreSQL');
        client.release();
    })
    .catch(err => logger.error('❌ Error conectando a la base de datos:', err));

export default pool;
