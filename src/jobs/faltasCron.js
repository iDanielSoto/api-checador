import cron from 'node-cron';
import { pool } from '../config/db.js';
import { generateId, ID_PREFIXES } from '../utils/idGenerator.js';
import logger from '../utils/logger.js';
import { requestContext } from '../utils/context.js';

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
        logger.info(`[CRON FALTAS] Iniciando revisión de faltas - ${new Date().toLocaleString()}`);
        try {
            await registrarFaltasDelDia();
        } catch (error) {
            logger.error('[CRON FALTAS] Error:', error);
        }
    }, {
        timezone: 'America/Mexico_City'
    });

    logger.info('[CRON FALTAS] Programado: todos los días a las 23:59 (America/Mexico_City)');
}

async function registrarFaltasDelDia() {
    const diasSemana = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
    const hoy = new Date();
    const diaHoy = diasSemana[hoy.getDay()];

    // Obtener todos los empleados activos con horario asignado
    const empleados = await pool.query(`
        SELECT e.id as empleado_id, e.horario_id, u.nombre, h.configuracion, u.empresa_id, em.prefijo as empresa_prefijo
        FROM empleados e
        INNER JOIN usuarios u ON u.id = e.usuario_id
        INNER JOIN empresas em ON em.id = u.empresa_id
        INNER JOIN horarios h ON h.id = e.horario_id AND h.es_activo = true
        WHERE u.estado_cuenta = 'activo'
          AND e.horario_id IS NOT NULL
    `);

    if (empleados.rows.length === 0) {
        logger.info('[CRON FALTAS] No hay empleados activos con horario.');
        return;
    }

    // 1. Obtener todas las asistencias del día en una sola consulta
    const asistenciasHoyResult = await pool.query(`
        SELECT empleado_id FROM asistencias
        WHERE DATE(fecha_registro) = CURRENT_DATE
    `);
    const empleadosConAsistencia = new Set(asistenciasHoyResult.rows.map(a => a.empleado_id));

    // 2. Obtener departamentos de todos los empleados
    const deptosResult = await pool.query(`
        SELECT empleado_id, departamento_id 
        FROM empleados_departamentos
        WHERE es_activo = true
    `);

    // Mapa: empleado_id -> departamento_id (tomamos el primero que encontremos, igual que antes con LIMIT 1)
    const deptosMap = new Map();
    deptosResult.rows.forEach(d => {
        if (!deptosMap.has(d.empleado_id)) {
            deptosMap.set(d.empleado_id, d.departamento_id);
        }
    });

    let faltasRegistradas = 0;

    for (const emp of empleados.rows) {
        try {
            // Verificar si el empleado tenía turno hoy
            const turnoHoy = getTurnoHoy(emp.configuracion, diaHoy);

            if (!turnoHoy) {
                continue;
            }

            // Verificar si ya tiene asistencia hoy (en memoria)
            if (empleadosConAsistencia.has(emp.empleado_id)) {
                continue;
            }

            const departamentoId = deptosMap.get(emp.empleado_id) || null;

            // Calcular fecha de registro basada en la hora de entrada del turno
            const [hora, minuto] = turnoHoy.entrada.split(':');
            const fechaRegistro = new Date();
            fechaRegistro.setHours(parseInt(hora), parseInt(minuto), 0, 0);

            await requestContext.run(new Map([['empresa_prefijo', emp.empresa_prefijo]]), async () => {
                // Registrar falta con la fecha calculada
                const id = await generateId(ID_PREFIXES.ASISTENCIA);
                await pool.query(`
                    INSERT INTO asistencias(id, estado, dispositivo_origen, empleado_id, departamento_id, fecha_registro, empresa_id)
                    VALUES($1, 'falta', 'escritorio', $2, $3, $4, $5)
                `, [id, emp.empleado_id, departamentoId, fechaRegistro.toISOString(), emp.empresa_id]);

                // Registrar evento
                const eventoId = await generateId(ID_PREFIXES.EVENTO);
                await pool.query(`
                    INSERT INTO eventos(id, titulo, descripcion, tipo_evento, prioridad, empleado_id, empresa_id, detalles, fecha_registro)
                    VALUES($1, $2, $3, 'asistencia', 'media', $4, $5, $6, $7)
                `, [
                    eventoId,
                    'Falta registrada automáticamente',
                    `${emp.nombre} no registró asistencia el día de hoy`,
                    emp.empleado_id,
                    emp.empresa_id,
                    JSON.stringify({
                        asistencia_id: id,
                        estado: 'falta',
                        dispositivo_origen: 'escritorio',
                        tipo: 'entrada',
                        departamento_id: departamentoId,
                        automatico: true,
                        horario_turno: turnoHoy,
                        empresa_id: emp.empresa_id
                    }),
                    fechaRegistro.toISOString()
                ]);
            });

            faltasRegistradas++;
        } catch (error) {
            logger.error(`[CRON FALTAS] Error con empleado ${emp.empleado_id}:`, error);
        }
    }

    logger.info(`[CRON FALTAS] Finalizado. Faltas registradas: ${faltasRegistradas}`);
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
