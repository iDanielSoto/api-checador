
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

        console.log("Iniciando migración de enum 'tipo_evento'...");
        client = await pool.connect();

        await client.query("ALTER TYPE tipo_evento ADD VALUE IF NOT EXISTS 'asistencia_manual'");
        console.log("✅ Valor 'asistencia_manual' agregado exitosamente al enum 'tipo_evento'");
    } catch (error) {
        console.error("❌ Error al alterar el enum:", error.message);
    } finally {
        if (client) client.release();
        if (pool) await pool.end();
    }
}

migrate();
