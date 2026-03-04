
import cron from 'node-cron';
import { pool } from '../config/db.js';
import { generateId, ID_PREFIXES } from '../utils/idGenerator.js';
import logger from '../utils/logger.js';
import { srvObtenerTurnosDeHoy, srvBuscarBloqueActual } from '../services/asistencias.service.js';

export function iniciarCronSalidasNoCumplidas() {
    // Se ejecuta cada 15 minutos para mayor precisión
    cron.schedule('*/15 * * * *', async () => {
        logger.info(`[CRON SALIDAS] Revisando salidas no cumplidas - ${new Date().toLocaleString()}`);
        try {
            await revisarSalidasNoCumplidas();
        } catch (error) {
            logger.error('[CRON SALIDAS] Error:', error);
        }
    }, {
        timezone: 'America/Mexico_City'
    });

    logger.info('[CRON SALIDAS] Programado: cada 15 minutos (America/Mexico_City)');
}

async function revisarSalidasNoCumplidas() {
    const ahora = new Date();
    const minsHoraActual = ahora.getHours() * 60 + ahora.getMinutes();
    const diasSemana = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
    const diaHoy = diasSemana[ahora.getDay()];

    // 1. Obtener empleados activos cuyo horario obligue a salida y tengan tolerancias
    const query = await pool.query(`
        SELECT 
            e.id as empleado_id, e.horario_id, u.nombre, h.configuracion, u.empresa_id,
            t.minutos_posterior_salida, c.requiere_salida,
            COALESCE(c.intervalo_bloques_minutos, 60) as intervalo_bloques_minutos
        FROM empleados e
        INNER JOIN usuarios u ON u.id = e.usuario_id
        INNER JOIN horarios h ON h.id = e.horario_id
        INNER JOIN empresas em ON em.id = u.empresa_id
        INNER JOIN configuraciones c ON c.id = em.configuracion_id
        INNER JOIN tolerancias t ON t.id = c.tolerancia_id
        WHERE u.estado_cuenta = 'activo'
          AND c.requiere_salida = TRUE
          AND h.es_activo = TRUE
    `);

    for (const emp of query.rows) {
        try {
            // 2. Obtener los turnos y fusionarlos en bloques (igual que en la asistencia normal)
            const turnosHoy = srvObtenerTurnosDeHoy(emp.configuracion, ahora);
            if (!turnosHoy || turnosHoy.length === 0) continue;

            const rangos = turnosHoy.map(t => {
                const [he, me] = (t.inicio || t.entrada || "00:00").split(':').map(Number);
                const [hs, ms] = (t.fin || t.salida || "00:00").split(':').map(Number);
                return { entrada: he * 60 + me, salida: hs * 60 + ms };
            }).sort((a, b) => a.entrada - b.entrada);

            // Fusión de bloques
            const bloques = [];
            if (rangos.length > 0) {
                let bActual = { ...rangos[0] };
                for (let i = 1; i < rangos.length; i++) {
                    const rSiguiente = rangos[i];
                    if ((rSiguiente.entrada - bActual.salida) <= emp.intervalo_bloques_minutos) {
                        bActual.salida = Math.max(bActual.salida, rSiguiente.salida);
                    } else {
                        bloques.push({ ...bActual });
                        bActual = { ...rSiguiente };
                    }
                }
                bloques.push(bActual);
            }

            // 3. Revisar cada bloque
            for (const bloque of bloques) {
                const limiteSalida = bloque.salida + (emp.minutos_posterior_salida || 60);

                // Si la hora actual ya superó el límite de salida del bloque
                if (minsHoraActual > limiteSalida) {
                    // Verificar si ya registró entrada pero NO salida para este bloque
                    const regs = await pool.query(`
                        SELECT * FROM asistencias 
                        WHERE empleado_id = $1 
                        AND DATE(fecha_registro) = CURRENT_DATE
                    `, [emp.empleado_id]);

                    const regsBloque = regs.rows.filter(r => {
                        const d = new Date(r.fecha_registro);
                        const m = d.getHours() * 60 + d.getMinutes();
                        return (m >= bloque.entrada - 60 && m <= bloque.salida + (emp.minutos_posterior_salida || 60));
                    });

                    const tieneEntrada = regsBloque.some(r => r.tipo === 'entrada');
                    const tieneSalida = regsBloque.some(r => r.tipo === 'salida' || (r.tipo === 'sistema' && r.estado === 'salida_no_cumplida'));

                    if (tieneEntrada && !tieneSalida) {
                        logger.info(`[CRON SALIDAS] Empleado ${emp.nombre} no cumplió salida en bloque ${bloque.entrada}-${bloque.salida}. Registrando...`);

                        const id = await generateId(ID_PREFIXES.ASISTENCIA);
                        // Obtener depto
                        const deptoRes = await pool.query(`SELECT departamento_id FROM empleados_departamentos WHERE empleado_id = $1 AND es_activo = true LIMIT 1`, [emp.empleado_id]);
                        const deptoId = deptoRes.rows[0]?.departamento_id || null;

                        // Registrar salida no cumplida
                        await pool.query(`
                            INSERT INTO asistencias (id, estado, dispositivo_origen, empleado_id, departamento_id, tipo, empresa_id)
                            VALUES ($1, 'salida_no_cumplida', 'sistema', $2, $3, 'salida', $4)
                        `, [id, emp.empleado_id, deptoId, emp.empresa_id]);

                        // Evento
                        const eventoId = await generateId(ID_PREFIXES.EVENTO);
                        await pool.query(`
                            INSERT INTO eventos (id, titulo, descripcion, tipo_evento, prioridad, empleado_id, detalles, empresa_id)
                            VALUES ($1, $2, $3, 'asistencia', 'media', $4, $5, $6)
                        `, [eventoId, 'Salida no registrada', `${emp.nombre} no registró su salida a tiempo`, emp.empleado_id, JSON.stringify({ bloque, limiteSalida }), emp.empresa_id]);
                    }
                }
            }

        } catch (err) {
            logger.error(`[CRON SALIDAS] Error procesando empleado ${emp.empleado_id}:`, err);
        }
    }
}
