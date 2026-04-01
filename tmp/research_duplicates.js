
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

async function research() {
    try {
        console.log("--- Investigando la tabla 'departamentos' ---");
        
        // 1. Listar todos para ver qué hay
        const allDeptos = await pool.query(`SELECT id, nombre, empresa_id, es_activo FROM departamentos ORDER BY empresa_id, nombre`);
        console.log(`Total de departamentos: ${allDeptos.rows.length}`);
        allDeptos.rows.forEach(d => console.log(`  - ID: ${d.id}, Nombre: "${d.nombre}", Empresa: ${d.empresa_id}`));

        // 2. Encontrar nombres duplicados globales (ignorando empresa_id)
        const globalDupsQuery = `
            SELECT LOWER(TRIM(nombre)) as normalized_name, COUNT(*) as "count"
            FROM departamentos
            GROUP BY LOWER(TRIM(nombre))
            HAVING COUNT(*) > 1
        `;
        const globalDups = await pool.query(globalDupsQuery);
        console.log(`Se encontraron ${globalDups.rows.length} grupos de nombres de departamentos duplicados GLOBALES.`);
        for (const row of globalDups.rows) {
            console.log(`  - "${row.normalized_name}": ${row.count} ocurrencias`);
        }

        // 3. Encontrar nombres duplicados por empresa (normalizando espacios y mayúsculas/minúsculas)

        for (const row of dupNames.rows) {
            console.log(`\nGrupo: "${row.normalized_name}" (Empresa: ${row.empresa_id}) - ${row.count} ocurrencias`);
            
            // Obtener las IDs de estos departamentos
            const idsQuery = `SELECT id, nombre, es_activo FROM departamentos WHERE LOWER(TRIM(nombre)) = $1 AND empresa_id = $2 ORDER BY es_activo DESC, id ASC`;
            const ids = await pool.query(idsQuery, [row.normalized_name, row.empresa_id]);
            
            const keepId = ids.rows[0].id;
            const deleteIds = ids.rows.slice(1).map(r => r.id);
            
            console.log(`  Mantenemos ID: ${keepId} ("${ids.rows[0].nombre}")`);
            console.log(`  Eliminaremos IDs: ${deleteIds.join(', ')}`);
            
            // Contar registros vinculados
            const empDepCount = await pool.query(`SELECT COUNT(*) FROM empleados_departamentos WHERE departamento_id = ANY($1)`, [deleteIds]);
            const asisCount = await pool.query(`SELECT COUNT(*) FROM asistencias WHERE departamento_id = ANY($1)`, [deleteIds]);
            
            console.log(`  Registros afectados:`);
            console.log(`    - empleados_departamentos: ${empDepCount.rows[0].count}`);
            console.log(`    - asistencias: ${asisCount.rows[0].count}`);
        }

        console.log("\n--- Fin de la investigación ---");
    } catch (err) {
        console.error("Error durante la investigación:", err);
    } finally {
        await pool.end();
    }
}

research();
