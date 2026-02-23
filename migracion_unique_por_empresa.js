/**
 * migracion_unique_por_empresa.js
 * 
 * Cambia los constraints UNIQUE globales de (usuario) y (correo)
 * por constraints COMPUESTOS (usuario, empresa_id) y (correo, empresa_id).
 * 
 * Esto permite que el mismo correo/usuario exista en distintas empresas,
 * pero no en la misma.
 */

import pkg from 'pg';
const pool = new pkg.Pool({ user: 'postgres', host: 'localhost', database: 'checador-fas', password: 'Minions090405', port: 5432 });

async function migrate() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // 1. Eliminar constraints UNIQUE globales
        console.log('Eliminando constraint UNIQUE global de usuario...');
        await client.query('ALTER TABLE usuarios DROP CONSTRAINT IF EXISTS usuarios_usuario_key');

        console.log('Eliminando constraint UNIQUE global de correo...');
        await client.query('ALTER TABLE usuarios DROP CONSTRAINT IF EXISTS usuarios_correo_key');

        // 2. Eliminar índices duplicados que puedan interferir
        console.log('Eliminando índice idx_usuarios_correo (si existe)...');
        await client.query('DROP INDEX IF EXISTS idx_usuarios_correo');

        // 3. Crear nuevos constraints compuestos (usuario + empresa_id) y (correo + empresa_id)
        console.log('Creando constraint UNIQUE compuesto (usuario, empresa_id)...');
        await client.query(`
            ALTER TABLE usuarios
            ADD CONSTRAINT usuarios_usuario_empresa_key UNIQUE (usuario, empresa_id)
        `);

        console.log('Creando constraint UNIQUE compuesto (correo, empresa_id)...');
        await client.query(`
            ALTER TABLE usuarios
            ADD CONSTRAINT usuarios_correo_empresa_key UNIQUE (correo, empresa_id)
        `);

        await client.query('COMMIT');
        console.log('\n✅ Migración completada exitosamente.');
        console.log('   → Ahora el mismo correo/usuario puede usarse en distintas empresas.');
        console.log('   → Pero NO puede duplicarse dentro de la misma empresa.');

    } catch (e) {
        await client.query('ROLLBACK');
        console.error('\n❌ Error en migración:', e.message);
    } finally {
        client.release();
        process.exit(0);
    }
}

migrate();
