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
    // 00  00   *        *     1-5 (lunes a viernes)
    cron.schedule('59 23 * * 1-7', async () => {
        console.log(`[CRON FALTAS] Iniciando revisión de faltas - ${new Date().toLocaleString()}`);
        try {
            await registrarFaltasDelDia();
        } catch (error) {
            console.error('[CRON FALTAS] Error:', error);
        }
    }, {
        timezone: 'America/Mexico_City'
    });

    console.log('[CRON FALTAS] Programado: todos los días a las 23:59 (America/Mexico_City)');
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
            const turnoHoy = getTurnoHoy(emp.configuracion, diaHoy);

            if (!turnoHoy) {
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

            // Calcular fecha de registro basada en la hora de entrada del turno
            const [hora, minuto] = turnoHoy.entrada.split(':');
            const fechaRegistro = new Date();
            fechaRegistro.setHours(parseInt(hora), parseInt(minuto), 0, 0);

            // Registrar falta con la fecha calculada
            const id = await generateId(ID_PREFIXES.ASISTENCIA);
            await pool.query(`
                INSERT INTO asistencias(id, estado, dispositivo_origen, empleado_id, departamento_id, fecha_registro)
                VALUES($1, 'falta', 'escritorio', $2, $3, $4)
            `, [id, emp.empleado_id, departamentoId, fechaRegistro.toISOString()]);

            // Registrar evento
            const eventoId = await generateId(ID_PREFIXES.EVENTO);
            await pool.query(`
                INSERT INTO eventos(id, titulo, descripcion, tipo_evento, prioridad, empleado_id, detalles, fecha_registro)
                VALUES($1, $2, $3, 'asistencia', 'media', $4, $5, $6)
            `, [
                eventoId,
                'Falta registrada automáticamente',
                `${emp.nombre} no registró asistencia el día de hoy`,
                emp.empleado_id,
                JSON.stringify({
                    asistencia_id: id,
                    estado: 'falta',
                    dispositivo_origen: 'escritorio',
                    tipo: 'entrada',
                    departamento_id: departamentoId,
                    automatico: true,
                    horario_turno: turnoHoy
                }),
                fechaRegistro.toISOString() // Usar la misma fecha para el evento
            ]);

            faltasRegistradas++;
        } catch (error) {
            console.error(`[CRON FALTAS] Error con empleado ${emp.empleado_id}:`, error.message);
        }
    }

    console.log(`[CRON FALTAS] Finalizado. Faltas registradas: ${faltasRegistradas}`);
}

function getTurnoHoy(configuracion, diaHoy) {
    try {
        const config = typeof configuracion === 'string'
            ? JSON.parse(configuracion)
            : configuracion;

        if (!config) return null;

        // Opción 1: configuracion_semanal
        if (config.configuracion_semanal) {
            const turnosDia = config.configuracion_semanal[diaHoy];
            if (turnosDia && turnosDia.length > 0) {
                // Retornar el primer turno (entrada: 'HH:MM', salida: 'HH:MM')
                return {
                    entrada: turnosDia[0].inicio,
                    salida: turnosDia[0].fin
                };
            }
        }

        // Opción 2: dias + turnos
        if (config.dias && config.dias.includes(diaHoy)) {
            if (config.turnos && config.turnos.length > 0) {
                return config.turnos[0];
            }
        }

        return null;
    } catch {
        return null;
    }
}
