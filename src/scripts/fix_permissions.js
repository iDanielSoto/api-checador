import { pool } from '../config/db.js';

async function fixPermissions() {
    try {
        console.log('🔍 Checking roles...');

        // 1. Find the Admin role (or similar)
        const rolesResult = await pool.query("SELECT * FROM roles WHERE nombre ILIKE '%Admin%'");

        if (rolesResult.rows.length === 0) {
            console.error('❌ No Admin role found! Creating one...');
            // Create role if configured
            // But usually Admin exists.
            const newRole = await pool.query(
                "INSERT INTO roles (nombre, descripcion, es_admin, es_empleado, posicion) VALUES ($1, $2, $3, $4, $5) RETURNING *",
                ['Administrador', 'Rol con acceso total al sistema', true, false, 1]
            );
            console.log('✅ Created role:', newRole.rows[0]);
            rolesResult.rows.push(newRole.rows[0]);
        }

        const adminRole = rolesResult.rows[0];
        console.log(`✅ Using role: ${adminRole.nombre} (ID: ${adminRole.id})`);

        // 2. Set permissions: SUPER_ADMIN (bit 62) + CONFIGURACION_MODIFICAR (bit 25)
        // Bit 62 is 2^62 = 4611686018427387904
        // Bit 25 is 2^25 = 33554432
        // We can use JS BigInt to calculate the value.

        const SUPER_ADMIN = BigInt(1) << BigInt(62); // 4611686018427387904n
        const CONFIG_MOD = BigInt(1) << BigInt(25); // 33554432n

        const newPermissions = SUPER_ADMIN | CONFIG_MOD;

        console.log(`🔒 Applying permissions: ${newPermissions.toString()}...`);

        await pool.query(
            "UPDATE roles SET permisos_bitwise = $1, es_admin = true WHERE id = $2",
            [newPermissions.toString(), adminRole.id]
        );

        console.log('✅ Permissions updated successfully!');

        // 3. Ensure users with this role have active assignments
        console.log('🔍 Checking user-role assignments...');
        const assignments = await pool.query("SELECT * FROM usuarios_roles WHERE rol_id = $1", [adminRole.id]);

        if (assignments.rows.length === 0) {
            console.warn('⚠️ Warning: No users assigned to Admin role. Assigning to any existing user named "admin" or similar.');
            const users = await pool.query("SELECT * FROM usuarios WHERE usuario ILIKE '%admin%' OR correo ILIKE '%admin%' LIMIT 1");
            if (users.rows.length > 0) {
                const u = users.rows[0];
                await pool.query("INSERT INTO usuarios_roles (usuario_id, rol_id, es_activo) VALUES ($1, $2, true)", [u.id, adminRole.id]);
                console.log(`✅ Assigned Admin role to user: ${u.usuario}`);
            } else {
                console.warn("❌ No admin users found to assign the role to.");
            }
        } else {
            console.log(`✅ ${assignments.rows.length} users have the Admin role assigned.`);
            // Ensure assignments are active
            await pool.query("UPDATE usuarios_roles SET es_activo = true WHERE rol_id = $1", [adminRole.id]);
            console.log('✅ Ensured all Admin assignments are active.');
        }

    } catch (error) {
        console.error('❌ Error fixing permissions:', error);
    } finally {
        await pool.end();
        process.exit();
    }
}

fixPermissions();
