/**
 * Verificación: llama directamente a la lógica de equivalencias para los 3 empleados de prueba
 */
import pkg from 'pg';
const pool = new pkg.Pool({ user: 'postgres', host: 'localhost', database: 'checador-fas', password: 'Minions090405', port: 5432 });

const empleados = [
    { id: 'ITL-EMP-00000000000000000000000000000004', nombre: 'Edgar Yahir' },
    { id: 'ITL-EMP-00000000000000000000000000000005', nombre: 'Javier Vázquez' },
    { id: 'ITL-EMP-00000000000000000000000000000003', nombre: 'Kevin Bolaños' }
];

const inicio = '2026-02-01';
const fin = '2026-02-23';

for (const emp of empleados) {
    const stats = await pool.query(`
        SELECT
            COUNT(*) FILTER (WHERE estado = 'retardo_a')  AS retardos_a,
            COUNT(*) FILTER (WHERE estado = 'retardo_b')  AS retardos_b,
            COUNT(*) FILTER (WHERE estado = 'falta')      AS faltas,
            COUNT(*) FILTER (WHERE estado = 'puntual')    AS puntuales
        FROM asistencias
        WHERE empleado_id = $1
          AND tipo = 'entrada'
          AND fecha_registro::date BETWEEN $2 AND $3
    `, [emp.id, inicio, fin]);

    const s = stats.rows[0];
    const retA = parseInt(s.retardos_a);
    const retB = parseInt(s.retardos_b);
    const eqA = 10, eqB = 5;
    const faltasEquiv = Math.floor(retA / eqA) + Math.floor(retB / eqB);
    const notasMalas = Math.floor(retA / 2) + retB;

    console.log(`\n📋 ${emp.nombre}:`);
    console.log(`   Puntuales:           ${s.puntuales}`);
    console.log(`   Retardos A (11-20):  ${retA}  → ${Math.floor(retA / eqA)} falta(s) equiv, ${retA % eqA} restantes`);
    console.log(`   Retardos B (21-29):  ${retB}  → ${Math.floor(retB / eqB)} falta(s) equiv, ${retB % eqB} restantes`);
    console.log(`   Faltas directas:     ${s.faltas}`);
    console.log(`   Faltas EQUIVALENTES: ${faltasEquiv}`);
    console.log(`   Notas malas (Art.80): ${notasMalas}  (5 = suspensión)`);
}

process.exit(0);
