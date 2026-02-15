import { pool } from '../config/db.js';
import { generateId, ID_PREFIXES } from '../utils/idGenerator.js';
import { broadcast } from '../utils/sse.js';

const MINUTOS_SEPARACION_TURNOS = 15;

function agruparTurnosConcatenados(turnos) {
    if (!turnos || turnos.length === 0) {
        return [];
    }
    if (turnos.length === 1) {
        return [turnos];
    }
    const grupos = [];
    let grupoActual = [turnos[0]];
    for (let i = 1; i < turnos.length; i++) {
        const turnoAnterior = grupoActual[grupoActual.length - 1];
        const turnoActual = turnos[i];
        const [hSalida, mSalida] = turnoAnterior.salida.split(':').map(Number);
        const minutosSalida = hSalida * 60 + mSalida;
        const [hEntrada, mEntrada] = turnoActual.entrada.split(':').map(Number);
        const minutosEntrada = hEntrada * 60 + mEntrada;
        const diferencia = minutosEntrada - minutosSalida;
        if (diferencia <= MINUTOS_SEPARACION_TURNOS) {
            grupoActual.push(turnoActual);
        } else {
            grupos.push(grupoActual);
            grupoActual = [turnoActual];
        }
    }
    grupos.push(grupoActual);
    return grupos;
}

function getEntradaSalidaGrupo(grupo) {
    if (!grupo || grupo.length === 0) {
        return { entrada: '00:00', salida: '00:00' };
    }
    return {
        entrada: grupo[0].entrada,
        salida: grupo[grupo.length - 1].salida
    };
}

/**
 * Identifica el bloque de horario correspondiente a la hora actual
 */
function identificarBloqueHorario(gruposTurnos, horaActual, tolerancia) {
    const margenAnticipado = tolerancia?.minutos_anticipado_max || 60;
    const margenFalta = tolerancia?.minutos_falta || 30;
    for (let i = 0; i < gruposTurnos.length; i++) {
        const { entrada, salida } = getEntradaSalidaGrupo(gruposTurnos[i]);
        const [hE, mE] = entrada.split(':').map(Number);
        const [hS, mS] = salida.split(':').map(Number);
        const inicioBloque = hE * 60 + mE - margenAnticipado;
        const finBloque = hS * 60 + mS + margenFalta;
        if (horaActual >= inicioBloque && horaActual <= finBloque) {
            return { indice: i, entrada, salida, inicioBloque, finBloque };
        }
    }
    return null;
}

/**
 * Verifica si un bloque ya tiene entrada y salida registradas
 */
function bloqueCompletado(registrosHoy, bloque) {
    if (!registrosHoy || registrosHoy.length === 0 || !bloque) return false;
    // Filtrar registros dentro del rango del bloque
    const registrosEnBloque = registrosHoy.filter(reg => {
        const fecha = new Date(reg.fecha_registro);
        const minutos = fecha.getHours() * 60 + fecha.getMinutes();
        return minutos >= bloque.inicioBloque && minutos <= bloque.finBloque;
    });
    // Necesita al menos 2 registros (1 entrada + 1 salida) para estar completo
    const totalRegistros = registrosEnBloque.length;
    console.log(`[bloqueCompletado] Bloque ${bloque.entrada}-${bloque.salida}: registros=${totalRegistros}`);
    return totalRegistros >= 2;
}

function calcularEstadoEntrada(turno, horaActual, tolerancia) {
    const [horaEntrada, minEntrada] = turno.entrada.split(':').map(Number);
    const minEntradaTurno = horaEntrada * 60 + minEntrada;
    const minutosAnticipado = tolerancia.minutos_anticipado_max || 60;
    const inicioVentana = minEntradaTurno - minutosAnticipado;
    const finToleranciaRetardo = minEntradaTurno + tolerancia.minutos_retardo;
    const finToleranciaFalta = minEntradaTurno + tolerancia.minutos_falta;
    if (horaActual >= inicioVentana && horaActual <= finToleranciaRetardo) {
        return 'puntual';
    }
    if (horaActual > finToleranciaRetardo && horaActual <= finToleranciaFalta) {
        return 'retardo';
    }
    const [horaSalida, minSalida] = turno.salida.split(':').map(Number);
    const minSalidaTurno = horaSalida * 60 + minSalida;
    if (horaActual > finToleranciaFalta && horaActual <= minSalidaTurno) {
        return 'falta';
    }
    return 'falta';
}

function calcularEstadoSalida(turno, horaActual, tolerancia) {
    const minutosTolerancia = tolerancia.aplica_tolerancia_salida
        ? (tolerancia.minutos_retardo || 10)
        : 10;
    const [horaSalida, minSalida] = turno.salida.split(':').map(Number);
    const minSalidaTurno = horaSalida * 60 + minSalida;
    const inicioVentanaSalida = minSalidaTurno - minutosTolerancia;
    if (horaActual >= inicioVentanaSalida && horaActual <= minSalidaTurno + 5) {
        return 'salida_puntual';
    }
    if (horaActual < inicioVentanaSalida) {
        return 'salida_temprano';
    }
    return 'salida_puntual';
}

function calcularEstadoAsistencia(configuracionHorario, ahora, tolerancia, esEntrada, totalRegistrosHoy = 0) {
    try {
        if (!configuracionHorario) {
            return esEntrada ? 'puntual' : 'salida_puntual';
        }
        const diasSemana = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
        const diaSemana = diasSemana[ahora.getDay()];
        let config = typeof configuracionHorario === 'string'
            ? JSON.parse(configuracionHorario)
            : configuracionHorario;
        let turnosHoy = [];
        if (config.configuracion_semanal && config.configuracion_semanal[diaSemana]) {
            turnosHoy = config.configuracion_semanal[diaSemana].map(t => ({
                entrada: t.inicio,
                salida: t.fin
            }));
        } else if (config.dias && config.dias.includes(diaSemana)) {
            turnosHoy = config.turnos || [];
        }
        if (turnosHoy.length === 0) {
            return esEntrada ? 'puntual' : 'salida_puntual';
        }
        const gruposTurnos = agruparTurnosConcatenados(turnosHoy);
        const horaActual = ahora.getHours() * 60 + ahora.getMinutes();
        if (esEntrada) {
            const numeroGrupo = Math.floor(totalRegistrosHoy / 2);
            if (numeroGrupo >= gruposTurnos.length) {
                return 'puntual';
            }
            const grupoActual = gruposTurnos[numeroGrupo];
            const { entrada, salida } = getEntradaSalidaGrupo(grupoActual);
            return calcularEstadoEntrada(
                { entrada, salida },
                horaActual,
                tolerancia
            );
        } else {
            const numeroGrupo = Math.floor(totalRegistrosHoy / 2);
            if (numeroGrupo >= gruposTurnos.length) {
                return 'salida_puntual';
            }
            const grupoActual = gruposTurnos[numeroGrupo];
            const { entrada, salida } = getEntradaSalidaGrupo(grupoActual);
            return calcularEstadoSalida(
                { entrada, salida },
                horaActual,
                tolerancia
            );
        }
    } catch (error) {
        return esEntrada ? 'puntual' : 'salida_puntual';
    }
}

export async function registrarAsistencia(req, res) {
    try {
        const {
            empleado_id,
            dispositivo_origen,
            ubicacion,
            departamento_id,
            estado: estadoRecibido,
            tipo,
            tipo_movimiento // Frontend escritorio puede enviar esto
        } = req.body;
        if (!empleado_id || !dispositivo_origen) {
            return res.status(400).json({
                success: false,
                message: 'empleado_id y dispositivo_origen son requeridos'
            });
        }
        const empleado = await pool.query(`
            SELECT e.id, e.horario_id, u.nombre, h.configuracion
            FROM empleados e
            INNER JOIN usuarios u ON u.id = e.usuario_id
            LEFT JOIN horarios h ON h.id = e.horario_id
            WHERE e.id = $1 AND u.estado_cuenta = 'activo'
    `, [empleado_id]);
        if (empleado.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Empleado no encontrado o inactivo'
            });
        }
        // VALIDAR SI ES DÍA FESTIVO
        const hoy = new Date();
        const fechaHoy = hoy.toISOString().split('T')[0];
        const esFestivo = await pool.query(`
            SELECT id, nombre, tipo FROM dias_festivos 
            WHERE fecha = $1 AND es_obligatorio = true AND es_activo = true
        `, [fechaHoy]);
        if (esFestivo.rows.length > 0) {
            return res.status(400).json({
                success: false,
                message: `Hoy es día festivo: ${esFestivo.rows[0].nombre}`,
                es_festivo: true,
                festivo: esFestivo.rows[0]
            });
        }
        const registrosHoy = await pool.query(`
            SELECT a.id, a.estado, a.fecha_registro, a.tipo
            FROM asistencias a
            WHERE a.empleado_id = $1 AND DATE(a.fecha_registro) = CURRENT_DATE
            ORDER BY a.fecha_registro ASC
    `, [empleado_id]);
        const totalRegistrosHoy = registrosHoy.rows.length;

        // Determinar tipo (entrada/salida)
        let tipoAsistencia = 'entrada';

        // 1. Si viene del frontend, usar eso
        if (tipo) {
            tipoAsistencia = tipo.toLowerCase();
        } else if (tipo_movimiento) {
            tipoAsistencia = tipo_movimiento.toLowerCase();
        } else {
            // 2. Si no viene, calcular (fallback)
            tipoAsistencia = totalRegistrosHoy % 2 === 0 ? 'entrada' : 'salida';
        }
        const esEntrada = tipoAsistencia === 'entrada';
        const toleranciaQuery = await pool.query(`
            SELECT t.minutos_retardo, t.minutos_falta, t.permite_registro_anticipado,
    t.minutos_anticipado_max, t.aplica_tolerancia_salida
            FROM tolerancias t
            INNER JOIN roles r ON r.tolerancia_id = t.id
            INNER JOIN usuarios_roles ur ON ur.rol_id = r.id
            INNER JOIN empleados e ON e.usuario_id = ur.usuario_id
            WHERE e.id = $1 AND ur.es_activo = true
            ORDER BY r.posicion DESC
            LIMIT 1
        `, [empleado_id]);
        const tolerancia = toleranciaQuery.rows[0] || {
            minutos_retardo: 10,
            minutos_falta: 30,
            permite_registro_anticipado: true,
            minutos_anticipado_max: 60
        };
        // ========== VALIDACIÓN DE BLOQUE COMPLETADO ==========
        if (esEntrada && empleado.rows[0].configuracion) {
            const ahora = new Date();
            const horaActual = ahora.getHours() * 60 + ahora.getMinutes();
            const config = typeof empleado.rows[0].configuracion === 'string'
                ? JSON.parse(empleado.rows[0].configuracion)
                : empleado.rows[0].configuracion;
            const diasSemana = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
            const dia = diasSemana[ahora.getDay()];
            let turnosHoy = [];
            if (config.configuracion_semanal && config.configuracion_semanal[dia]) {
                turnosHoy = config.configuracion_semanal[dia].map(t => ({
                    entrada: t.inicio,
                    salida: t.fin
                }));
            } else if (config.dias && config.dias.includes(dia)) {
                turnosHoy = config.turnos || [];
            }
            const gruposTurnos = agruparTurnosConcatenados(turnosHoy);
            const bloque = identificarBloqueHorario(gruposTurnos, horaActual, tolerancia);
            if (bloque && bloqueCompletado(registrosHoy.rows, bloque)) {
                console.log(`[Asistencia] ❌ Bloque ${bloque.entrada}-${bloque.salida} ya completado para ${empleado_id}`);
                return res.status(400).json({
                    success: false,
                    message: `El bloque ${bloque.entrada}-${bloque.salida} ya está completado. No puedes registrar otra entrada.`,
                    bloque_completado: true,
                    bloque: { entrada: bloque.entrada, salida: bloque.salida }
                });
            }
        }
        // Usar estado del frontend si viene, de lo contrario calcular
        const estadoCalculado = calcularEstadoAsistencia(
            empleado.rows[0].configuracion,
            new Date(),
            tolerancia,
            esEntrada,
            totalRegistrosHoy
        );
        const estado = estadoRecibido || estadoCalculado;
        console.log(`[Asistencia] estadoRecibido=${estadoRecibido}, estadoCalculado=${estadoCalculado}, final=${estado}, tipo=${tipoAsistencia}`);
        const id = await generateId(ID_PREFIXES.ASISTENCIA);
        const ubicacionArray = ubicacion ? `{${ubicacion.join(',')} } ` : null;
        const resultado = await pool.query(`
            INSERT INTO asistencias(id, estado, dispositivo_origen, ubicacion, empleado_id, departamento_id, tipo)
            VALUES($1, $2, $3, $4, $5, $6, $7)
            RETURNING *
    `, [id, estado, dispositivo_origen, ubicacionArray, empleado_id, departamento_id, tipoAsistencia]);
        const eventoId = await generateId(ID_PREFIXES.EVENTO);
        await pool.query(`
            INSERT INTO eventos(id, titulo, descripcion, tipo_evento, prioridad, empleado_id, detalles)
            VALUES($1, $2, $3, 'asistencia', 'baja', $4, $5)
        `, [
            eventoId,
            `Registro de ${tipoAsistencia} - ${estado} `,
            `${empleado.rows[0].nombre} registró ${tipoAsistencia} `,
            empleado_id,
            JSON.stringify({
                asistencia_id: id,
                estado,
                dispositivo_origen,
                tipo: tipoAsistencia,
                departamento_id
            })
        ]);
        res.status(201).json({
            success: true,
            message: `Asistencia registrada como ${estado} `,
            data: {
                ...resultado.rows[0],
                empleado_nombre: empleado.rows[0].nombre,
                tipo: tipoAsistencia
            }
        });
        // Notificar via SSE
        broadcast('nueva-asistencia', {
            id: resultado.rows[0].id,
            empleado_id,
            empleado_nombre: empleado.rows[0].nombre,
            estado,
            tipo: tipoAsistencia,
            fecha: new Date()
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error al registrar asistencia',
            error: error.message
        });
    }
}

export async function getAsistencias(req, res) {
    try {
        const {
            empleado_id,
            departamento_id,
            estado,
            fecha_inicio,
            fecha_fin,
            limit = 50,
            offset = 0
        } = req.query;
        let query = `
            SELECT
                a.id,
                a.estado,
                a.dispositivo_origen,
                a.ubicacion,
                a.fecha_registro,
                a.empleado_id,
                a.departamento_id,
                a.tipo,
                u.nombre as empleado_nombre,
                u.usuario as empleado_usuario,
                u.foto as empleado_foto,
                d.nombre as departamento_nombre
            FROM asistencias a
            INNER JOIN empleados e ON e.id = a.empleado_id
            INNER JOIN usuarios u ON u.id = e.usuario_id
            LEFT JOIN departamentos d ON d.id = a.departamento_id
            WHERE 1 = 1
    `;
        const params = [];
        let paramIndex = 1;
        if (empleado_id) {
            query += ` AND a.empleado_id = $${paramIndex++} `;
            params.push(empleado_id);
        }
        if (departamento_id) {
            query += ` AND e.id IN(
        SELECT empleado_id FROM empleados_departamentos
                WHERE departamento_id = $${paramIndex++} AND es_activo = true
    )`;
            params.push(departamento_id);
        }
        if (estado) {
            query += ` AND a.estado = $${paramIndex++} `;
            params.push(estado);
        }
        if (fecha_inicio) {
            query += ` AND a.fecha_registro >= $${paramIndex++} `;
            params.push(fecha_inicio);
        }
        if (fecha_fin) {
            query += ` AND a.fecha_registro <= $${paramIndex++} `;
            params.push(fecha_fin);
        }
        query += ` ORDER BY a.fecha_registro DESC LIMIT $${paramIndex++} OFFSET $${paramIndex} `;
        params.push(parseInt(limit), parseInt(offset));
        const resultado = await pool.query(query, params);
        res.json({
            success: true,
            data: resultado.rows
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error al obtener asistencias'
        });
    }
}

export async function getAsistenciasEmpleado(req, res) {
    try {
        const { empleadoId } = req.params;
        const { fecha_inicio, fecha_fin } = req.query;
        let query = `
            SELECT
                a.id,
                a.estado,
                a.dispositivo_origen,
                a.ubicacion,
                a.fecha_registro,
                a.departamento_id,
                a.tipo,
                d.nombre as departamento_nombre
            FROM asistencias a
            LEFT JOIN departamentos d ON d.id = a.departamento_id
            WHERE a.empleado_id = $1
    `;
        const params = [empleadoId];
        let paramIndex = 2;
        if (fecha_inicio) {
            query += ` AND a.fecha_registro >= $${paramIndex++} `;
            params.push(fecha_inicio);
        }
        if (fecha_fin) {
            query += ` AND a.fecha_registro <= $${paramIndex++} `;
            params.push(fecha_fin);
        }
        query += ` ORDER BY a.fecha_registro DESC`;
        const resultado = await pool.query(query, params);
        const stats = await pool.query(`
            SELECT
                COUNT(*) as total,
                COUNT(*) FILTER(WHERE estado = 'puntual') as puntuales,
                COUNT(*) FILTER(WHERE estado = 'retardo') as retardos,
                COUNT(*) FILTER(WHERE estado = 'falta') as faltas,
                COUNT(*) FILTER(WHERE estado = 'salida_puntual') as salidas_puntuales,
                COUNT(*) FILTER(WHERE estado = 'salida_temprano') as salidas_tempranas
            FROM asistencias
            WHERE empleado_id = $1
            ${fecha_inicio ? `AND fecha_registro >= '${fecha_inicio}'` : ''}
            ${fecha_fin ? `AND fecha_registro <= '${fecha_fin}'` : ''}
`, [empleadoId]);
        res.json({
            success: true,
            data: resultado.rows,
            estadisticas: stats.rows[0]
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error al obtener asistencias del empleado'
        });
    }
}

export async function getAsistenciasHoy(req, res) {
    try {
        const { departamento_id } = req.query;
        const hoy = new Date();
        hoy.setHours(0, 0, 0, 0);
        let query = `
            SELECT
                a.id,
                a.estado,
                a.dispositivo_origen,
                a.fecha_registro,
                a.empresa_id,
                a.tipo,
                e.id as empleado_id,
                a.departamento_id,
                u.nombre as empleado_nombre,
                u.usuario as empleado_usuario,
                u.foto as empleado_foto,
                d.nombre as departamento_nombre
            FROM asistencias a
            INNER JOIN empleados e ON e.id = a.empleado_id
            INNER JOIN usuarios u ON u.id = e.usuario_id
            LEFT JOIN departamentos d ON d.id = a.departamento_id
            WHERE DATE(a.fecha_registro) = DATE($1)
    `;
        const params = [hoy];
        if (departamento_id) {
            query += ` AND e.id IN(
        SELECT empleado_id FROM empleados_departamentos
                WHERE departamento_id = $2 AND es_activo = true
    )`;
            params.push(departamento_id);
        }
        query += ` ORDER BY a.fecha_registro DESC`;
        const resultado = await pool.query(query, params);
        const resumen = {
            total: resultado.rows.length,
            puntuales: resultado.rows.filter(a => a.estado === 'puntual').length,
            retardos: resultado.rows.filter(a => a.estado === 'retardo').length,
            faltas: resultado.rows.filter(a => a.estado === 'falta').length,
            salidas_puntuales: resultado.rows.filter(a => a.estado === 'salida_puntual').length,
            salidas_tempranas: resultado.rows.filter(a => a.estado === 'salida_temprano').length
        };
        res.json({
            success: true,
            data: resultado.rows,
            resumen
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error al obtener asistencias de hoy'
        });
    }
}