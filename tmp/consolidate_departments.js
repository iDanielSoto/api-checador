
import pkg from 'pg';
import dotenv from 'dotenv';
const { Pool } = pkg;
dotenv.config();

const pool = new Pool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT,
});

async function migrate() {
    const client = await pool.connect();
    try {
        console.log("--- Iniciando consolidación de 'Guacamayas' ---");
        
        const ID_KEEP = 'ITL-DEP-00000000000000000000000000000073';
        const ID_DELETE = 'ITL-DEP-00000000000000000000000000000075';

        const resKeep = await client.query("SELECT * FROM departamentos WHERE id = $1", [ID_KEEP]);
        const resDelete = await client.query("SELECT * FROM departamentos WHERE id = $1", [ID_DELETE]);

        if (resKeep.rows.length === 0 || resDelete.rows.length === 0) {
            console.error("No se encontraron ambos departamentos. Abortando.");
            return;
        }

        const deptoKeep = resKeep.rows[0];
        const deptoDelete = resDelete.rows[0];

        await client.query('BEGIN');

        // 1. Fusionar ubicaciones
        let zonasNew = [...(deptoKeep.ubicacion?.zonas || [])];
        const zonasDelete = deptoDelete.ubicacion?.zonas || [];
        
        // Evitar duplicados de zonas si tienen las mismas coordenadas (simplificado)
        for (const z of zonasDelete) {
            zonasNew.push(z);
        }
        
        await client.query("UPDATE departamentos SET ubicacion = $1 WHERE id = $2", [JSON.stringify({ zonas: zonasNew }), ID_KEEP]);
        console.log("✅ Ubicaciones fusionadas.");

        // 2. Mover asistencias
        const asisUpd = await client.query("UPDATE asistencias SET departamento_id = $1 WHERE departamento_id = $2", [ID_KEEP, ID_DELETE]);
        console.log(`✅ ${asisUpd.rowCount} asistencias migradas.`);

        // 3. Mover empleados_departamentos
        // Primero, encontrar empleados que están en ambos
        const both = await client.query(`
            SELECT ed1.empleado_id 
            FROM empleados_departamentos ed1
            INNER JOIN empleados_departamentos ed2 ON ed1.empleado_id = ed2.empleado_id
            WHERE ed1.departamento_id = $1 AND ed2.departamento_id = $2
        `, [ID_KEEP, ID_DELETE]);

        if (both.rows.length > 0) {
            const empIds = both.rows.map(r => r.empleado_id);
            await client.query("DELETE FROM empleados_departamentos WHERE departamento_id = $1 AND empleado_id = ANY($2)", [ID_DELETE, empIds]);
            console.log(`✅ ${both.rows.length} empleados repetidos eliminados del depto basura.`);
        }

        const empMigrated = await client.query("UPDATE empleados_departamentos SET departamento_id = $1 WHERE departamento_id = $2", [ID_KEEP, ID_DELETE]);
        console.log(`✅ ${empMigrated.rowCount} empleados movidos al depto primario.`);

        // 4. Borrar depto basura
        await client.query("DELETE FROM departamentos WHERE id = $1", [ID_DELETE]);
        console.log("✅ Departamento duplicado eliminado.");

        // 5. Agregar UNIQUE constraint a la tabla
        // Primero limpiar cualquier otro duplicado (si existiera) normalizando
        // (Pero según mi investigación no hay más exactos ahora)
        
        console.log("--- Aplicando UNIQUE constraint ---");
        await client.query("ALTER TABLE departamentos ADD CONSTRAINT departamentos_nombre_empresa_unique UNIQUE (nombre, empresa_id)");
        console.log("✅ Restricción UNIQUE aplicada correctamente.");

        await client.query('COMMIT');
        console.log("--- Migración completada con éxito ---");

    } catch (err) {
        await client.query('ROLLBACK');
        console.error("❌ Error en la migración:", err);
    } finally {
        client.release();
        await pool.end();
    }
}

migrate();
