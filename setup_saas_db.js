import { pool } from './src/config/db.js';
import bcrypt from 'bcrypt';
import { generateId, ID_PREFIXES } from './src/utils/idGenerator.js';

async function setupSuperAdministradoresTable() {
    const client = await pool.connect();
    try {
        console.log("=== PREPARANDO ARQUITECTURA: TABLA 'super_administradores' ===");
        await client.query('BEGIN');

        // 1. Eliminar la columna provisional de la tabla usuarios si existe
        console.log("-> Revertiendo posible columna 'es_propietario_saas' en 'usuarios'...");
        await client.query(`
            ALTER TABLE usuarios 
            DROP COLUMN IF EXISTS es_propietario_saas;
        `);

        // 2. Crear tabla dedicada para Super Administradores SaaS
        console.log("-> Creando tabla segura 'super_administradores'...");
        await client.query(`
            CREATE TABLE IF NOT EXISTS super_administradores (
                id VARCHAR(50) PRIMARY KEY,
                usuario VARCHAR(50) UNIQUE NOT NULL,
                correo VARCHAR(100) UNIQUE NOT NULL,
                contraseña VARCHAR(255) NOT NULL,
                nombre VARCHAR(100) NOT NULL,
                estado_cuenta VARCHAR(20) DEFAULT 'activo',
                fecha_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // 3. Crear el primer Super Administrador Maestro si la tabla está vacía
        const result = await client.query('SELECT COUNT(*) FROM super_administradores');
        if (parseInt(result.rows[0].count) === 0) {
            console.log("-> Inyectando cuenta Maestra inicial...");

            // Reemplaza con tus datos reales si es necesario. La contraseña es 12345678 encryptada.
            const rawPassword = 'admin';
            const hash = await bcrypt.hash(rawPassword, 10);

            const adminId = 'saas_' + Date.now();

            await client.query(`
                INSERT INTO super_administradores (id, usuario, correo, contraseña, nombre)
                VALUES ($1, 'admin_saas', 'admin@saas.com', $2, 'Propietario Principal')
            `, [adminId, hash]);

            console.log(`\n¡Cuenta Maestra Creada! \nUsuario: admin_saas \nContraseña: ${rawPassword}`);
        } else {
            console.log("-> La tabla ya contiene cuentas maestras.");
        }

        await client.query('COMMIT');
        console.log("=== ARQUITECTURA COMPLETADA EXITOSAMENTE ===");

    } catch (error) {
        await client.query('ROLLBACK');
        console.error("Error al construir la arquitectura SaaS:", error);
    } finally {
        client.release();
        await pool.end();
    }
}

setupSuperAdministradoresTable();
