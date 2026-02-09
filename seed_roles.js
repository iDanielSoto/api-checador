import { pool } from './src/config/db.js';
import { generateId, ID_PREFIXES } from './src/utils/idGenerator.js';
import { GRUPOS_PERMISOS } from './src/utils/permissions.js';

async function seedRoles() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        console.log('Seeding roles...');

        // 1. Crear/Actualizar Rol SUPER ADMIN (Posición 1)
        let superAdminRoleId;
        const adminRolResult = await client.query("SELECT id FROM roles WHERE nombre = 'Super Admin'");
        if (adminRolResult.rows.length > 0) {
            superAdminRoleId = adminRolResult.rows[0].id;
            await client.query("UPDATE roles SET posicion = 1 WHERE id = $1", [superAdminRoleId]);
            console.log('Updated Role Super Admin position to 1');
        } else {
            superAdminRoleId = await generateId(ID_PREFIXES.ROL);
            await client.query(`
                INSERT INTO roles (id, nombre, descripcion, posicion, permisos_bitwise, es_admin, es_empleado, es_activo, color)
                VALUES ($1, 'Super Admin', 'Acceso total al sistema', 1, $2, true, false, true, '#ef4444')
            `, [superAdminRoleId, GRUPOS_PERMISOS.ADMIN_COMPLETO.toString()]);
            console.log('Created Role Super Admin with position 1');
        }

        // 2. Crear/Actualizar Rol SUPERVISOR (Posición 2)
        let supervisorRoleId;
        const supRolResult = await client.query("SELECT id FROM roles WHERE nombre = 'Supervisor'");
        if (supRolResult.rows.length > 0) {
            supervisorRoleId = supRolResult.rows[0].id;
            await client.query("UPDATE roles SET posicion = 2 WHERE id = $1", [supervisorRoleId]);
            console.log('Updated Role Supervisor position to 2');
        } else {
            supervisorRoleId = await generateId(ID_PREFIXES.ROL);
            await client.query(`
                INSERT INTO roles (id, nombre, descripcion, posicion, permisos_bitwise, es_admin, es_empleado, es_activo, color)
                VALUES ($1, 'Supervisor', 'Supervisa asistencias y reportes', 2, $2, false, true, true, '#f59e0b')
            `, [supervisorRoleId, GRUPOS_PERMISOS.SUPERVISOR.toString()]);
            console.log('Created Role Supervisor with position 2');
        }

        // 3. Crear/Actualizar Rol EMPLEADO (Posición 3)
        let empleadoRoleId;
        const empRolResult = await client.query("SELECT id FROM roles WHERE nombre = 'Empleado'");
        if (empRolResult.rows.length > 0) {
            empleadoRoleId = empRolResult.rows[0].id;
            await client.query("UPDATE roles SET posicion = 3 WHERE id = $1", [empleadoRoleId]);
            console.log('Updated Role Empleado position to 3');
        } else {
            empleadoRoleId = await generateId(ID_PREFIXES.ROL);
            await client.query(`
                INSERT INTO roles (id, nombre, descripcion, posicion, permisos_bitwise, es_admin, es_empleado, es_activo, color)
                VALUES ($1, 'Empleado', 'Acceso básico para empleados', 3, $2, false, true, true, '#3b82f6')
            `, [empleadoRoleId, GRUPOS_PERMISOS.EMPLEADO_BASICO.toString()]);
            console.log('Created Role Empleado with position 3');
        }

        // 5. Asignar Rol SUPER ADMIN a TODOS los usuarios (Para debugging/setup inicial como pidió el usuario)
        const allUsers = await client.query("SELECT id, usuario FROM usuarios");
        console.log(`Found ${allUsers.rows.length} users to upgrade to Super Admin`);

        for (const user of allUsers.rows) {
            const hasRole = await client.query("SELECT id FROM usuarios_roles WHERE usuario_id = $1 AND rol_id = $2", [user.id, superAdminRoleId]);
            if (hasRole.rows.length === 0) {
                const urId = await generateId(ID_PREFIXES.USUARIO_ROL);
                await client.query("INSERT INTO usuarios_roles (id, usuario_id, rol_id, es_activo) VALUES ($1, $2, $3, true)", [urId, user.id, superAdminRoleId]);
                console.log(`Assigned Super Admin role to user ${user.usuario} (${user.id})`);
            } else {
                // Ensure it is active
                await client.query("UPDATE usuarios_roles SET es_activo = true WHERE id = $1", [hasRole.rows[0].id]);
                console.log(`Ensured Super Admin role is active for user ${user.usuario} (${user.id})`);
            }
        }

        await client.query('COMMIT');
        console.log('Seeding completed successfully');
    } catch (e) {
        await client.query('ROLLBACK');
        console.error('Error seeding roles:', e);
    } finally {
        client.release();
        await pool.end();
    }
}

seedRoles();
