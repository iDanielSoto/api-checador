import { pool } from './src/config/db.js';

async function diagnosticar() {
    try {
        console.log("=== USUARIOS POR EMPRESA (NO EMA00001) ===");
        const usuarios = await pool.query(`
            SELECT u.id, u.usuario, u.empresa_id, u.estado_cuenta
            FROM usuarios u
            WHERE u.empresa_id != 'EMA00001'
            ORDER BY u.empresa_id
        `);
        console.log(JSON.stringify(usuarios.rows, null, 2));

        console.log("\n=== ROLES ASIGNADOS A ESOS USUARIOS ===");
        const roles = await pool.query(`
            SELECT u.usuario, u.empresa_id as usuario_empresa,
                   r.nombre as rol_nombre, r.empresa_id as rol_empresa,
                   ur.es_activo
            FROM usuarios u
            INNER JOIN usuarios_roles ur ON ur.usuario_id = u.id
            INNER JOIN roles r ON r.id = ur.rol_id
            WHERE u.empresa_id != 'EMA00001'
        `);
        console.log(JSON.stringify(roles.rows, null, 2));

        console.log("\n=== ROLES EXISTENTES EN CADA EMPRESA ===");
        const rolesPorEmpresa = await pool.query(`
            SELECT empresa_id, array_agg(nombre) as roles
            FROM roles
            GROUP BY empresa_id
            ORDER BY empresa_id
        `);
        console.log(JSON.stringify(rolesPorEmpresa.rows, null, 2));

    } catch (err) {
        console.error("Error:", err.message);
    } finally {
        await pool.end();
    }
}

diagnosticar();
