import { pool } from '../src/config/db.js';

async function migrate() {
    const client = await pool.connect();
    try {
        console.log('--- Iniciando Migración de Trazabilidad de Horarios ---');

        await client.query('BEGIN');

        console.log('1. Añadiendo columna horario_id a la tabla asistencias...');
        // Usamos VARCHAR(20) o CHAR(8) según el estándar del proyecto (ID_PREFIXES.HORARIO es 'HOR-')
        // El prefijo HOR- sugiere que el ID es algo como HOR-XXXX. 
        // Verificamos el tamaño real en la tabla horarios.
        await client.query(`
            ALTER TABLE asistencias 
            ADD COLUMN IF NOT EXISTS horario_id VARCHAR(20) REFERENCES horarios(id)
        `);

        console.log('2. Poblando horario_id en asistencias existentes (infiriendo del horario actual del empleado)...');
        const result = await client.query(`
            UPDATE asistencias a
            SET horario_id = e.horario_id
            FROM empleados e
            WHERE a.empleado_id = e.id 
              AND a.horario_id IS NULL
              AND e.horario_id IS NOT NULL
        `);

        console.log(`✅ Se actualizaron ${result.rowCount} registros de asistencia.`);

        await client.query('COMMIT');
        console.log('--- Migración Completada Exitosamente ---');
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('❌ Error durante la migración:', error);
    } finally {
        client.release();
        process.exit();
    }
}

migrate();
function minsToHHMM(m) {
    return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}
