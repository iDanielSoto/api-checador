import cron from 'node-cron';
import { pool } from '../config/db.js';
import { generateId, ID_PREFIXES } from '../utils/idGenerator.js';

/**
 * Cron job que registra faltas automáticas para empleados
 * que no registraron entrada en el día.
 *
 * Se ejecuta de lunes a viernes a las 23:55.
 */
export function iniciarCronFaltas() {
    // Min Hour DayMonth Month DayWeek
    // 55  23   *        *     1-5 (lunes a viernes)
    cron.schedule('55 23 * * 1-5', async () => {
        console.log(`[CRON FALTAS] Iniciando revisión de faltas - ${new Date().toLocaleString()}`);
        try {
            await registrarFaltasDelDia();
        } catch (error) {
            console.error('[CRON FALTAS] Error:', error);
        }
    }, {
        timezone: 'America/Mexico_City'
    });

    console.log('[CRON FALTAS] Programado: lunes a viernes a las 23:55 (America/Mexico_City)');
}

async function registrarFaltasDelDia() {
    const diasSemana = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
    const hoy = new Date();
    const diaHoy = diasSemana[hoy.getDay()];

    // Obtener todos los empleados activos con horario asignado
    const empleados = await pool.query(`
        SELECT e.id as empleado_id, e.horario_id, u.nombre, h.configuracion
        FROM empleados e
        INNER JOIN usuarios u ON u.id = e.usuario_id
        INNER JOIN horarios h ON h.id = e.horario_id AND h.es_activo = true
        WHERE u.estado_cuenta = 'activo'
          AND e.horario_id IS NOT NULL
    `);

    if (empleados.rows.length === 0) {
        console.log('[CRON FALTAS] No hay empleados activos con horario.');
        return;
    }

    let faltasRegistradas = 0;

    for (const emp of empleados.rows) {
        try {
            // Verificar si el empleado tenía turno hoy
            if (!tieneTurnoHoy(emp.configuracion, diaHoy)) {
                continue;
            }

            // Verificar si ya tiene algún registro de asistencia hoy
            const asistenciaHoy = await pool.query(`
                SELECT id FROM asistencias
                WHERE empleado_id = $1 AND DATE(fecha_registro) = CURRENT_DATE
                LIMIT 1
            `, [emp.empleado_id]);

            if (asistenciaHoy.rows.length > 0) {
                // Ya tiene al menos un registro, no marcar falta
                continue;
            }

            // Obtener un departamento del empleado (para el registro)
            const depto = await pool.query(`
                SELECT departamento_id FROM empleados_departamentos
                WHERE empleado_id = $1 AND es_activo = true
                LIMIT 1
            `, [emp.empleado_id]);

            const departamentoId = depto.rows.length > 0 ? depto.rows[0].departamento_id : null;

            // Registrar falta
            const id = await generateId(ID_PREFIXES.ASISTENCIA);
            await pool.query(`
                INSERT INTO asistencias(id, estado, dispositivo_origen, empleado_id, departamento_id)
                VALUES($1, 'falta', 'sistema', $2, $3)
            `, [id, emp.empleado_id, departamentoId]);

            // Registrar evento
            const eventoId = await generateId(ID_PREFIXES.EVENTO);
            await pool.query(`
                INSERT INTO eventos(id, titulo, descripcion, tipo_evento, prioridad, empleado_id, detalles)
                VALUES($1, $2, $3, 'asistencia', 'media', $4, $5)
            `, [
                eventoId,
                'Falta registrada automáticamente',
                `${emp.nombre} no registró asistencia el día de hoy`,
                emp.empleado_id,
                JSON.stringify({
                    asistencia_id: id,
                    estado: 'falta',
                    dispositivo_origen: 'sistema',
                    tipo: 'entrada',
                    departamento_id: departamentoId,
                    automatico: true
                })
            ]);

            faltasRegistradas++;
        } catch (error) {
            console.error(`[CRON FALTAS] Error con empleado ${emp.empleado_id}:`, error.message);
        }
    }

    console.log(`[CRON FALTAS] Finalizado. Faltas registradas: ${faltasRegistradas}`);
}

function tieneTurnoHoy(configuracion, diaHoy) {
    try {
        const config = typeof configuracion === 'string'
            ? JSON.parse(configuracion)
            : configuracion;

        if (!config) return false;

        // Opción 1: configuracion_semanal
        if (config.configuracion_semanal) {
            const turnosDia = config.configuracion_semanal[diaHoy];
            return turnosDia && turnosDia.length > 0;
        }

        // Opción 2: dias + turnos
        if (config.dias) {
            return config.dias.includes(diaHoy);
        }

        return false;
    } catch {
        return false;
    }
}
