import { pool } from './src/config/db.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function runMigration() {
    const client = await pool.connect();
    try {
        console.log("=== EJECUTANDO MIGRACIÓN: empresa_id en tablas ===\n");

        // Obtener empresa principal
        const empresaRes = await client.query(`
            SELECT id FROM empresas ORDER BY fecha_registro ASC LIMIT 1
        `);

        if (empresaRes.rows.length === 0) {
            console.error("❌ No hay empresas en la DB. Crea una empresa primero.");
            process.exit(1);
        }

        const empresaId = empresaRes.rows[0].id;
        console.log(`✅ Empresa principal para migración: ${empresaId}\n`);

        await client.query('BEGIN');

        const tablas = [
            {
                tabla: 'eventos',
                derivar: null
            },
            {
                tabla: 'incidencias',
                derivar: null
            },
            {
                tabla: 'movil',
                // Derivar empresa_id desde el empleado → usuario
                derivar: `
                    UPDATE movil m
                    SET empresa_id = u.empresa_id
                    FROM empleados e
                    INNER JOIN usuarios u ON u.id = e.usuario_id
                    WHERE e.id = m.empleado_id AND m.empresa_id IS NULL AND u.empresa_id IS NOT NULL
                `
            },
            {
                tabla: 'escritorio',
                derivar: null
            },
            {
                tabla: 'asistencias',
                derivar: `
                    UPDATE asistencias a
                    SET empresa_id = u.empresa_id
                    FROM empleados e
                    INNER JOIN usuarios u ON u.id = e.usuario_id
                    WHERE e.id = a.empleado_id AND a.empresa_id IS NULL AND u.empresa_id IS NOT NULL
                `
            }
        ];

        for (const { tabla, derivar } of tablas) {
            // Verificar si ya tiene la columna
            const colRes = await client.query(`
                SELECT 1 FROM information_schema.columns
                WHERE table_name = $1 AND column_name = 'empresa_id'
            `, [tabla]);

            if (colRes.rows.length > 0) {
                console.log(`⏭️  ${tabla}: ya tiene empresa_id, omitido.`);
                continue;
            }

            console.log(`🔧 Procesando: ${tabla}...`);

            // Añadir columna
            await client.query(`ALTER TABLE ${tabla} ADD COLUMN empresa_id VARCHAR(255)`);
            console.log(`  + columna empresa_id añadida`);

            // Intentar derivar empresa_id si hay lógica específica
            if (derivar) {
                const derivResult = await client.query(derivar);
                console.log(`  + derivación automática: ${derivResult.rowCount} registros actualizados`);
            }

            // Fallback para registros sin empresa_id
            const fallbackRes = await client.query(`
                UPDATE ${tabla} SET empresa_id = $1 WHERE empresa_id IS NULL
            `, [empresaId]);
            console.log(`  + fallback principal: ${fallbackRes.rowCount} registros asignados a ${empresaId}`);

            // Añadir foreign key
            try {
                await client.query(`
                    ALTER TABLE ${tabla}
                    ADD CONSTRAINT fk_${tabla}_empresa
                    FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE
                `);
                console.log(`  + foreign key añadida ✅`);
            } catch (fkErr) {
                console.warn(`  ⚠️  FK no añadida (puede que ya exista): ${fkErr.message}`);
            }
        }

        await client.query('COMMIT');
        console.log("\n✅ MIGRACIÓN COMPLETADA EXITOSAMENTE\n");

        // Verificación final
        console.log("=== VERIFICACIÓN: Tablas con empresa_id ===");
        const verifyRes = await client.query(`
            SELECT table_name, data_type
            FROM information_schema.columns
            WHERE column_name = 'empresa_id'
              AND table_name IN ('eventos','incidencias','movil','escritorio','asistencias',
                                 'empleados','roles','horarios','tolerancias','departamentos',
                                 'avisos','usuarios')
            ORDER BY table_name
        `);
        verifyRes.rows.forEach(r => {
            console.log(`  ✅ ${r.table_name}.empresa_id (${r.data_type})`);
        });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error("\n❌ MIGRACIÓN FALLIDA (ROLLBACK aplicado):", error.message);
        process.exit(1);
    } finally {
        client.release();
        await pool.end();
    }
}

runMigration();
