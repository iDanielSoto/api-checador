import { pool } from './src/config/db.js';

async function setupSaaSOwner() {
    const client = await pool.connect();
    try {
        console.log("=== PREPARANDO TABLAS PARA DUEÑO DEL SAAS ===");
        await client.query('BEGIN');

        // 1. Añadir la columna de propietario a usuarios si no existe
        const colRes = await client.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'usuarios' AND column_name = 'es_propietario_saas'
        `);

        if (colRes.rows.length === 0) {
            console.log("-> Añadiendo la columna 'es_propietario_saas' a la tabla 'usuarios'...");
            await client.query(`
                ALTER TABLE usuarios 
                ADD COLUMN es_propietario_saas BOOLEAN DEFAULT false
            `);
        } else {
            console.log("-> La columna 'es_propietario_saas' ya existe.");
        }

        // 2. Localizar al usuario Administrador Principal (basado en posicion de rol o antigüedad)
        // Tomaremos al primer usuario creado o al que quieras asignar manualmente.
        console.log("-> Asignando rol de PROPIETARIO al primer SuperAdmin del sistema...");

        await client.query(`
            UPDATE usuarios 
            SET es_propietario_saas = true 
            WHERE id = (
                SELECT u.id 
                FROM usuarios u
                INNER JOIN usuarios_roles ur ON u.id = ur.usuario_id
                INNER JOIN roles r ON ur.rol_id = r.id
                WHERE r.es_admin = true
                ORDER BY u.fecha_registro ASC
                LIMIT 1
            )
        `);

        await client.query('COMMIT');
        console.log("=== ACTUALIZACIÓN EXITOSA ===");

    } catch (error) {
        await client.query('ROLLBACK');
        console.error("Error al actualizar la base de datos:", error);
    } finally {
        client.release();
        await pool.end();
    }
}

setupSaaSOwner();
