// Script de reparación: crea roles propios para EMA00004 y reasigna al usuario pdts
import { pool } from './src/config/db.js';
import { generateId, ID_PREFIXES } from './src/utils/idGenerator.js';

async function repararEMA00004() {
    const client = await pool.connect();
    try {
        console.log("=== REPARANDO TENANT EMA00004 ===\n");

        // Verificar que EMA00004 existe
        const empresa = await client.query('SELECT id, nombre FROM empresas WHERE id = $1', ['EMA00004']);
        if (empresa.rows.length === 0) {
            console.error("❌ EMA00004 no existe.");
            process.exit(1);
        }
        console.log(`✅ Empresa: ${empresa.rows[0].nombre}`);

        // Verificar que el usuario pdts existe
        const usuario = await client.query('SELECT id, usuario, empresa_id FROM usuarios WHERE empresa_id = $1', ['EMA00004']);
        if (usuario.rows.length === 0) {
            console.error("❌ No hay usuarios en EMA00004.");
            process.exit(1);
        }
        console.log(`✅ Usuarios en EMA00004: ${usuario.rows.map(u => u.usuario).join(', ')}`);

        await client.query('BEGIN');

        // 1. Verificar que no haya roles ya creados para EMA00004
        const rolesExistentes = await client.query('SELECT id FROM roles WHERE empresa_id = $1', ['EMA00004']);
        if (rolesExistentes.rows.length > 0) {
            console.log(`⏭️  EMA00004 ya tiene ${rolesExistentes.rows.length} roles. Omitiendo creación.`);
        } else {
            // 2. Crear los 4 roles base para EMA00004
            const rolesBase = [
                { nombre: 'Empleado', posicion: 3, es_admin: false, es_empleado: true, permisos: '0' },
                { nombre: 'Jefe de departamento', posicion: 2, es_admin: false, es_empleado: true, permisos: '0' },
                { nombre: 'Supervisor', posicion: 1, es_admin: false, es_empleado: false, permisos: '0' },
                { nombre: 'Administrador', posicion: 0, es_admin: true, es_empleado: false, permisos: '9223372036854775807' },
            ];

            let rolAdminId = null;
            for (const rolDef of rolesBase) {
                const rolId = await generateId(ID_PREFIXES.ROL);
                await client.query(`
                    INSERT INTO roles (id, nombre, posicion, es_admin, es_empleado, permisos_bitwise, empresa_id, es_activo)
                    VALUES ($1, $2, $3, $4, $5, $6, 'EMA00004', true)
                `, [rolId, rolDef.nombre, rolDef.posicion, rolDef.es_admin, rolDef.es_empleado, rolDef.permisos]);
                console.log(`  + Rol creado: ${rolDef.nombre} (${rolId})`);
                if (rolDef.es_admin) rolAdminId = rolId;
            }

            // 3. Reasignar los usuarios de EMA00004 al nuevo rol Administrador
            for (const u of usuario.rows) {
                // Desactivar asignación anterior (rol de EMA00001)
                const desact = await client.query(
                    'UPDATE usuarios_roles SET es_activo = false WHERE usuario_id = $1',
                    [u.id]
                );
                console.log(`  - Roles anteriores desactivados para ${u.usuario}: ${desact.rowCount}`);

                // Asignar el nuevo rol Administrador de EMA00004
                const urlId = await generateId(ID_PREFIXES.USUARIO_ROL);
                await client.query(`
                    INSERT INTO usuarios_roles (id, usuario_id, rol_id, es_activo)
                    VALUES ($1, $2, $3, true)
                `, [urlId, u.id, rolAdminId]);
                console.log(`  ✅ ${u.usuario} reasignado al Administrador de EMA00004`);
            }
        }

        await client.query('COMMIT');
        console.log("\n✅ REPARACIÓN COMPLETADA EXITOSAMENTE");

        // Verificación final
        console.log("\n=== VERIFICACIÓN FINAL ===");
        const verif = await client.query(`
            SELECT u.usuario, u.empresa_id as usr_empresa,
                   r.nombre as rol, r.empresa_id as rol_empresa, r.es_admin
            FROM usuarios u
            INNER JOIN usuarios_roles ur ON ur.usuario_id = u.id AND ur.es_activo = true
            INNER JOIN roles r ON r.id = ur.rol_id
            WHERE u.empresa_id = 'EMA00004'
        `);
        console.log(JSON.stringify(verif.rows, null, 2));

    } catch (err) {
        await client.query('ROLLBACK');
        console.error("❌ Error (ROLLBACK):", err.message);
    } finally {
        client.release();
        await pool.end();
    }
}

repararEMA00004();
