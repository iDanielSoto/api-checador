import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env explicitly from api root
dotenv.config({ path: path.join(__dirname, '../.env') });

console.log("Environment loaded. Host:", process.env.DB_HOST);

async function migrate() {
    let pool;
    let client;
    try {
        // Import db after env vars are loaded
        const dbModule = await import('../src/config/db.js');
        pool = dbModule.pool;

        console.log('Iniciando migración de enum...');
        client = await pool.connect();

        await client.query("ALTER TYPE tipo_dispositivo_origen ADD VALUE IF NOT EXISTS 'manual'");
        console.log("✅ Valor 'manual' agregado exitosamente al enum 'tipo_dispositivo_origen'");
    } catch (error) {
        console.error("❌ Error al alterar el enum:", error.message);
    } finally {
        if (client) client.release();
        if (pool) await pool.end();
    }
}

migrate();
