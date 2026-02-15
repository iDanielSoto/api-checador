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
});

// Verificación de conexión
pool.connect()
    .then(() => logger.info('✅ Conectado a la base de datos PostgreSQL'))
    .catch(err => logger.error('❌ Error conectando a la base de datos:', err));

export default pool;