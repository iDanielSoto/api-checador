import { pool } from './src/config/db.js';

async function migrateMultiEmpresa() {
    const client = await pool.connect();
    try {
        console.log("=== INICIANDO MIGRACIÓN MULTI-EMPRESA ===");
        await client.query('BEGIN');

        // 1. Obtener una empresa principal para asignar los datos existentes
        const empresasRes = await client.query('SELECT id FROM empresas ORDER BY fecha_registro ASC LIMIT 1');
        let empresaId = null;

        if (empresasRes.rows.length === 0) {
            console.log("No hay empresas en la base de datos.");
            console.log("Creando una empresa principal por defecto...");

            // Generar o usar un ID para la nueva empresa
            const nuevaEmpresaId = 'emp_' + Date.now(); // O usa tu utilidad de ID si la importáramos
            await client.query(`
                INSERT INTO empresas (id, nombre, es_activo) 
                VALUES ($1, 'Empresa Principal', true)
            `, [nuevaEmpresaId]);
            empresaId = nuevaEmpresaId;
            console.log(`Empresa principal creada con ID: ${empresaId}`);
        } else {
            empresaId = empresasRes.rows[0].id;
            console.log(`Usando Empresa Principal existente con ID: ${empresaId}`);
        }

        // 2. Lista de tablas que deben tener empresa_id
        const tablasCatalogos = [
            'departamentos',
            'horarios',
            'tolerancias',
            'roles',
            'avisos',
            'dias_festivos',
            'incidencias',
            'asistencias'
        ];

        for (const tabla of tablasCatalogos) {
            console.log(`\nVerificando tabla '${tabla}'...`);

            // Comprobar si la columna ya existe
            const colRes = await client.query(`
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name = $1 AND column_name = 'empresa_id'
            `, [tabla]);

            if (colRes.rows.length === 0) {
                console.log(`- Agregando columna 'empresa_id' a '${tabla}'...`);
                // Agregamos la columna, permitiendo nulos momentáneamente
                await client.query(`ALTER TABLE ${tabla} ADD COLUMN empresa_id VARCHAR(255)`);

                console.log(`- Asignando registros existentes de '${tabla}' a la empresa principal...`);
                // Actualizamos todos los registros existentes para que pertenezcan a la empresa principal
                await client.query(`UPDATE ${tabla} SET empresa_id = $1 WHERE empresa_id IS NULL`, [empresaId]);

                console.log(`- Agregando llave foránea en '${tabla}' hacia 'empresas(id)'...`);
                // Agregamos la restricción de llave foránea (y opcionalmente hacerlo NOT NULL si tu lógica lo requiere)
                await client.query(`
                    ALTER TABLE ${tabla} 
                    ADD CONSTRAINT fk_${tabla}_empresa 
                    FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE
                `);
            } else {
                console.log(`- La tabla '${tabla}' ya tiene la columna 'empresa_id'.`);
            }
        }

        console.log("\nActualizando empleados para que hereden la empresa de su usuario (si aplica)...");
        // Empleados no necesita empresa si Usuario ya la tiene, pero si es necesario cruzar, 
        // revisemos si usuarios tiene empresa (lo vimos en el log anterior)
        const usuariosConEmpresaRes = await client.query(`
            SELECT column_name FROM information_schema.columns 
            WHERE table_name = 'usuarios' AND column_name = 'empresa_id'
        `);

        if (usuariosConEmpresaRes.rows.length > 0) {
            console.log("Usuarios ya tiene empresa_id, asignando usuarios sin empresa a la principal...");
            await client.query(`UPDATE usuarios SET empresa_id = $1 WHERE empresa_id IS NULL`, [empresaId]);
        }

        // Finalizar transacción
        await client.query('COMMIT');
        console.log("\n=== MIGRACIÓN COMPLETADA EXITOSAMENTE ===");

    } catch (error) {
        await client.query('ROLLBACK');
        console.error("\n[ERROR] Migración fallida. Haciendo Rollback de los cambios:", error);
    } finally {
        client.release();
        await pool.end();
    }
}

migrateMultiEmpresa();
