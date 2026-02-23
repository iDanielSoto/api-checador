/**
 * seed_test_retardos.js
 * 
 * Script de prueba: inserta registros de asistencia variados (puntual, retardo_a,
 * retardo_b, falta) para 3 empleados de ITLAC en la quincena de febrero 2026.
 * 
 * Esto permite probar:
 *  - Clasificación de estados
 *  - Endpoint de equivalencias
 *  - Reporte de quincena
 */

import pkg from 'pg';
const pool = new pkg.Pool({ user: 'postgres', host: 'localhost', database: 'checador-fas', password: 'Minions090405', port: 5432 });

const EMPRESA_ID = 'ITL-EMA-00000000000000000000000000000001';

// Empleados seleccionados (tienen horario configurado)
const empleados = [
    {
        id: 'ITL-EMP-00000000000000000000000000000004',
        nombre: 'Edgar Yahir',
        // Horario: entrada 09:00 en días configurados
        // Tolerancia admin: 3 min puntual, A: hasta 20min, B: hasta 29min
        entradaHorario: '09:00'
    },
    {
        id: 'ITL-EMP-00000000000000000000000000000005',
        nombre: 'Javier Vázquez',
        entradaHorario: '09:00'
    },
    {
        id: 'ITL-EMP-00000000000000000000000000000003',
        nombre: 'Kevin Bolaños',
        entradaHorario: '09:00'
    }
];

// Días de prueba en febrero 2026 (lunes a viernes disponibles de la quincena)
// Lunes 3, Martes 4, Miercoles 5, Jueves 6, Viernes 7, Lunes 9, Martes 10... hasta 15
const diasPrueba = [
    '2026-02-03', '2026-02-04', '2026-02-05', '2026-02-06', '2026-02-07',
    '2026-02-09', '2026-02-10', '2026-02-11', '2026-02-12', '2026-02-13'
];

// Patrones de checada por empleado (minutos tarde respecto al horario de entrada)
// Negativos = llegó antes, positivo = tarde
const patronesEntrada = {
    'ITL-EMP-00000000000000000000000000000004': [ // Edgar Yahir: mix variado
        -5,   // puntual (-5 min = llegó 5 min antes)
        15,   // retardo_a
        5,    // puntual
        25,   // retardo_b
        35,   // falta (>30min)
        8,    // puntual
        12,   // retardo_a
        22,   // retardo_b
        0,    // puntual (exacto)
        18,   // retardo_a
    ],
    'ITL-EMP-00000000000000000000000000000005': [ // Javier: muchos retardos A
        11, 13, 16, 14, 17,  // 5 × retardo_a
        19, 11, 15, 20, 12,  // 5 × retardo_a → total 10 = 1 falta equivalente
    ],
    'ITL-EMP-00000000000000000000000000000003': [ // Kevin: varios retardos B
        21, 24, 26, 22, 28,  // 5 × retardo_b → 1 falta equivalente
        2, 5, 30, 8, 3,      // 2 puntuales, 1 falta, 2 puntuales
    ]
};

// Hora de salida fija (+3h después de la entrada) para cada registro
function horaChecada(fecha, entradaBase, minutosExtra) {
    const [h, m] = entradaBase.split(':').map(Number);
    const totalMin = h * 60 + m + minutosExtra;
    const hFinal = Math.floor(totalMin / 60) % 24;
    const mFinal = totalMin % 60;
    return `${fecha} ${String(hFinal).padStart(2, '0')}:${String(mFinal).padStart(2, '0')}:00`;
}

async function insertarRegistros() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Primero limpiar registros de prueba de esas fechas que no sean los ya existentes reales
        // (solo eliminar los de dispositivo_origen = 'movil' con notas de test en ese rango para no borrar reales)
        // Usamos los IDs específicos con prefijo TEST-AST
        await client.query(`
            DELETE FROM asistencias 
            WHERE id LIKE 'TEST-AST-%'
              AND empresa_id = $1
        `, [EMPRESA_ID]);
        console.log('🗑️  Registros previos de test eliminados');

        let insertados = 0;

        for (const emp of empleados) {
            const patrones = patronesEntrada[emp.id];
            const deptoRes = await client.query(`
                SELECT departamento_id FROM empleados_departamentos 
                WHERE empleado_id = $1 AND es_activo = true LIMIT 1
            `, [emp.id]);
            const deptId = deptoRes.rows[0]?.departamento_id || null;

            for (let i = 0; i < diasPrueba.length; i++) {
                const fecha = diasPrueba[i];
                const minutosTarde = patrones[i];
                const tsEntrada = horaChecada(fecha, emp.entradaHorario, minutosTarde);
                const tsSalida = horaChecada(fecha, emp.entradaHorario, minutosTarde + 480); // +8h

                // Calcular estado según la nueva clasificación
                let estado;
                if (minutosTarde <= 10) estado = 'puntual';
                else if (minutosTarde <= 20) estado = 'retardo_a';
                else if (minutosTarde <= 29) estado = 'retardo_b';
                else estado = 'falta';

                // Verificar si ya existe un registro en esa fecha para ese empleado
                const existe = await client.query(`
                    SELECT id FROM asistencias 
                    WHERE empleado_id = $1 AND fecha_registro::date = $2::date AND tipo = 'entrada'
                    LIMIT 1
                `, [emp.id, fecha]);

                if (existe.rows.length > 0) {
                    console.log(`  ⏭️  Saltando ${emp.nombre} ${fecha} (ya existe)`);
                    continue;
                }

                // Generar IDs simples únicos para el seed
                const idEntrada = `TEST-AST-${emp.id.slice(-4)}-${fecha.replace(/-/g, '')}-E`;
                const idSalida = `TEST-AST-${emp.id.slice(-4)}-${fecha.replace(/-/g, '')}-S`;

                await client.query(`
                    INSERT INTO asistencias (id, estado, dispositivo_origen, fecha_registro, empleado_id, departamento_id, tipo, empresa_id)
                    VALUES ($1, $2, 'movil', $3, $4, $5, 'entrada', $6)
                    ON CONFLICT (id) DO NOTHING
                `, [idEntrada, estado, tsEntrada, emp.id, deptId, EMPRESA_ID]);

                await client.query(`
                    INSERT INTO asistencias (id, estado, dispositivo_origen, fecha_registro, empleado_id, departamento_id, tipo, empresa_id)
                    VALUES ($1, 'salida_puntual', 'movil', $2, $3, $4, 'salida', $5)
                    ON CONFLICT (id) DO NOTHING
                `, [idSalida, tsSalida, emp.id, deptId, EMPRESA_ID]);

                console.log(`  ✅ ${emp.nombre} ${fecha}: ${minutosTarde < 0 ? minutosTarde + 'min antes' : minutosTarde + 'min tarde'} → ${estado}`);
                insertados++;
            }
        }

        await client.query('COMMIT');
        console.log(`\n✅ ${insertados} días insertados correctamente`);

        // Resumen final
        const resumen = await pool.query(`
            SELECT u.nombre, a.estado, COUNT(*) as total
            FROM asistencias a
            INNER JOIN empleados e ON e.id = a.empleado_id
            INNER JOIN usuarios u ON u.id = e.usuario_id
            WHERE a.empresa_id = $1 AND a.tipo = 'entrada'
              AND a.dispositivo_origen = 'test_seed'
            GROUP BY u.nombre, a.estado ORDER BY u.nombre, a.estado
        `, [EMPRESA_ID]);
        console.log('\nResumen de datos de prueba:');
        console.table(resumen.rows);

    } catch (e) {
        await client.query('ROLLBACK');
        console.error('❌ Error:', e.message);
    } finally {
        client.release();
        process.exit(0);
    }
}

insertarRegistros();
