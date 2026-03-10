import pkg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const { Pool } = pkg;
const pool = new Pool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT,
});

const defaultValue = JSON.stringify([
    { metodo: 'huella', activo: true, nivel: 1 },
    { metodo: 'rostro', activo: true, nivel: 2 },
    { metodo: 'codigo', activo: true, nivel: 3 }
]);

try {
    await pool.query(`
        ALTER TABLE configuraciones_escritorio
        ADD COLUMN IF NOT EXISTS prioridad_biometrico JSONB
        DEFAULT '${defaultValue}'::jsonb;
    `);
    console.log('✅ Columna prioridad_biometrico agregada (o ya existia).');

    const res = await pool.query(`
        UPDATE configuraciones_escritorio
        SET prioridad_biometrico = '${defaultValue}'::jsonb
        WHERE prioridad_biometrico IS NULL;
    `);
    console.log(`✅ ${res.rowCount} filas actualizadas con valor por defecto.`);
} catch (err) {
    console.error('❌ Error en migracion:', err.message);
} finally {
    await pool.end();
}
