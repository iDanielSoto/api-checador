import { pool } from '../config/db.js';
import { generateId, ID_PREFIXES } from '../utils/idGenerator.js';
import { broadcast } from '../utils/sse.js';

const MINUTOS_NUEVO_TURNO_UMBRAL = 120; // 2 horas (120 minutos)

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

        // Bloques de tiempo menores a 2 horas (120 min) = mismo turno
        if (diferencia < MINUTOS_NUEVO_TURNO_UMBRAL) {
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

    // Lógica dinámica de Post-its:
    // Puntual: <= 10 minutos (tolerancia general asumida)
    const margenPuntual = minEntradaTurno + 10;
    const margenRetardoA = minEntradaTurno + 20; // Hasta 20 min
    const margenRetardoB = minEntradaTurno + 29; // Hasta 29 min

    if (horaActual >= inicioVentana && horaActual <= margenPuntual) {
        return 'puntual';
    }

    if (horaActual > margenPuntual && horaActual <= margenRetardoA) {
        return 'retardo_a';
    }

    if (horaActual > margenRetardoA && horaActual <= margenRetardoB) {
        return 'retardo_b';
    }

    const [horaSalida, minSalida] = turno.salida.split(':').map(Number);
    const minSalidaTurno = horaSalida * 60 + minSalida;

    // Si pasaron 30 o más minutos pero todavía es turno, cuenta como falta por retardo mayor
    if (horaActual > margenRetardoB && horaActual <= minSalidaTurno) {
        return 'falta_por_retardo';
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
            INSERT INTO asistencias(id, estado, dispositivo_origen, ubicacion, empleado_id, departamento_id, tipo, empresa_id)
            VALUES($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING *
    `, [id, estado, dispositivo_origen, ubicacionArray, empleado_id, departamento_id, tipoAsistencia, req.empresa_id]);
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

        // ==========================================
        // FASE 2: Acumulación de Retardos (A y B)
        // ==========================================
        if (estado === 'retardo_a' || estado === 'retardo_b') {
            const isRetardoA = estado === 'retardo_a';
            const columnaRetardo = isRetardoA ? 'contador_retardos_a' : 'contador_retardos_b';
            const limiteRetardos = isRetardoA ? 10 : 5;

            // Actualizar el contador en la tabla empleados y obtener el nuevo valor
            const updateRes = await pool.query(`
                UPDATE empleados
                SET ${columnaRetardo} = ${columnaRetardo} + 1
                WHERE id = $1
                RETURNING ${columnaRetardo}
            `, [empleado_id]);

            const contadorActual = updateRes.rows[0][columnaRetardo];
            console.log(`[Asistencia] Empleado ${empleado_id} sumó 1 a ${columnaRetardo}. Total: ${contadorActual}/${limiteRetardos}`);

            // Si llega al límite de retardos, se convierte en falta
            if (contadorActual >= limiteRetardos) {
                // 1. Reiniciar el contador a 0
                await pool.query(`
                    UPDATE empleados
                    SET ${columnaRetardo} = 0
                    WHERE id = $1
                `, [empleado_id]);

                // 2. Crear una nueva "asistencia" con estado 'falta' y tipo 'sistema' para representarlo
                const idFalta = await generateId(ID_PREFIXES.ASISTENCIA);
                const motivoFalta = `Acumulación de ${limiteRetardos} retardos tipo ${isRetardoA ? 'A' : 'B'}`;

                await pool.query(`
                    INSERT INTO asistencias(id, estado, dispositivo_origen, empleado_id, departamento_id, tipo, empresa_id)
                VALUES($1, 'falta', 'sistema', $2, $3, 'sistema', $4)
                    `, [idFalta, empleado_id, departamento_id, req.empresa_id]);

                // 3. Registrar el Evento de "Falta Acumulada"
                const idEventoFalta = await generateId(ID_PREFIXES.EVENTO);
                const tipoR = isRetardoA ? 'A' : 'B';
                await pool.query(`
                    INSERT INTO eventos(id, titulo, descripcion, tipo_evento, prioridad, empleado_id, detalles)
                VALUES($1, $2, $3, 'asistencia', 'alta', $4, $5)
                `, [
                    idEventoFalta,
                    'Falta por Acumulación de Retardos',
                    `${empleado.rows[0].nombre} alcanzó el límite de acumulaciones de Retardo ${tipoR}. Se ha generado una falta.`,
                    empleado_id,
                    JSON.stringify({
                        asistencia_id: idFalta,
                        estado: 'falta',
                        motivo: motivoFalta
                    })
                ]);

                console.log(`[Asistencia] Falta generada automáticamente por acumulación para el empleado ${empleado_id}.`);

                broadcast('nueva-asistencia', {
                    id: idFalta,
                    empleado_id,
                    empleado_nombre: empleado.rows[0].nombre,
                    estado: 'falta',
                    tipo: 'sistema',
                    motivo: motivoFalta,
                    fecha: new Date()
                });
            }
        }
        // ==========================================

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
            WHERE a.empresa_id = $1
                    `;
        const params = [req.empresa_id];
        let paramIndex = 2;
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
                    COUNT(*) FILTER(WHERE estado IN('retardo_a', 'retardo_b')) as retardos,
                        COUNT(*) FILTER(WHERE estado = 'retardo_a') as retardos_a,
                            COUNT(*) FILTER(WHERE estado = 'retardo_b') as retardos_b,
                                COUNT(*) FILTER(WHERE estado IN('falta', 'falta_por_retardo')) as faltas,
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
            retardos: resultado.rows.filter(a => a.estado === 'retardo_a' || a.estado === 'retardo_b').length,
            retardos_a: resultado.rows.filter(a => a.estado === 'retardo_a').length,
            retardos_b: resultado.rows.filter(a => a.estado === 'retardo_b').length,
            faltas: resultado.rows.filter(a => a.estado === 'falta' || a.estado === 'falta_por_retardo').length,
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

export async function registrarAsistenciaManual(req, res) {
    const client = await pool.connect();
    try {
        const {
            empleado_id,
            fecha, // YYYY-MM-DD
            hora_entrada, // HH:MM
            hora_salida, // HH:MM
            usar_horario, // boolean
            motivo,
            admin_id
        } = req.body;

        if (!empleado_id || !fecha) {
            return res.status(400).json({
                success: false,
                message: 'Empleado y fecha son requeridos'
            });
        }

        // ── Validar fecha futura (comparar strings YYYY-MM-DD, sin Date UTC) ──
        const hoyStr = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD en zona local
        if (fecha > hoyStr) {
            return res.status(400).json({
                success: false,
                message: 'No se pueden registrar asistencias en fechas futuras'
            });
        }

        // ── Iniciar transacción ANTES de cualquier consulta ──
        await client.query('BEGIN');

        // (la validación de duplicados se mueve después de calcular la hora de entrada)

        // ── Obtener datos del empleado + departamento + tolerancia ──
        const empleadoQuery = await client.query(`
            SELECT e.id, u.nombre, u.empresa_id, e.horario_id, h.configuracion,
                   ed.departamento_id,
                   t.minutos_retardo, t.minutos_retardo_a_max, t.minutos_retardo_b_max, t.minutos_falta
            FROM empleados e
            INNER JOIN usuarios u ON u.id = e.usuario_id
            LEFT JOIN horarios h ON h.id = e.horario_id
            LEFT JOIN empleados_departamentos ed ON ed.empleado_id = e.id AND ed.es_activo = true
            LEFT JOIN usuarios_roles ur ON ur.usuario_id = u.id AND ur.es_activo = true
            LEFT JOIN roles r ON r.id = ur.rol_id
            LEFT JOIN tolerancias t ON t.id = r.tolerancia_id
            WHERE e.id = $1
            ORDER BY r.posicion DESC
            LIMIT 1
        `, [empleado_id]);

        if (empleadoQuery.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ success: false, message: 'Empleado no encontrado' });
        }

        const empleado = empleadoQuery.rows[0];
        const empresaId = empleado.empresa_id;
        const deptoId = empleado.departamento_id || null;
        let entradaFinal = hora_entrada;
        let salidaFinal = hora_salida;
        let horaHorarioEntrada = null; // Para calcular el estado

        // ── Si usa horario, obtener horas del día correspondiente ──
        if (usar_horario) {
            const fechaObj = new Date(`${fecha}T12:00:00`); // Mediodía para evitar desfase UTC
            const diasSemana = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
            const diaSemana = diasSemana[fechaObj.getDay()];

            let horarioEncontrado = null;
            if (empleado.configuracion) {
                const config = typeof empleado.configuracion === 'string'
                    ? JSON.parse(empleado.configuracion)
                    : empleado.configuracion;

                if (config.configuracion_semanal && config.configuracion_semanal[diaSemana]) {
                    const turnos = config.configuracion_semanal[diaSemana];
                    if (turnos && turnos.length > 0) {
                        horarioEncontrado = turnos[0];
                    }
                } else if (config.dias && config.dias.includes(diaSemana)) {
                    if (config.turnos && config.turnos.length > 0) {
                        horarioEncontrado = config.turnos[0];
                    }
                }
            }

            if (!horarioEncontrado) {
                await client.query('ROLLBACK');
                return res.status(400).json({
                    success: false,
                    message: `No se encontró horario configurado para el día ${diaSemana}`
                });
            }

            entradaFinal = horarioEncontrado.inicio || horarioEncontrado.entrada;
            salidaFinal = horarioEncontrado.fin || horarioEncontrado.salida;
            horaHorarioEntrada = entradaFinal;
        }

        // ── Validar duplicados por turno (no por fecha completa) ──
        // Un día puede tener múltiples turnos, así que verificamos si ya existe
        // una entrada cuya hora esté cerca de la hora de este turno (±60 min)
        const fechaEntradaCheck = `${fecha} ${entradaFinal}:00`;
        const duplicado = await client.query(`
            SELECT id FROM asistencias
            WHERE empleado_id = $1
              AND tipo = 'entrada'
              AND fecha_registro::date = $2
              AND ABS(EXTRACT(EPOCH FROM (fecha_registro::time - $3::time)) / 60) < 60
            LIMIT 1
        `, [empleado_id, fecha, `${entradaFinal}:00`]);

        if (duplicado.rows.length > 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({
                success: false,
                message: `Ya existe un registro de entrada para este turno (${entradaFinal}) en ${fecha}`
            });
        }

        if (!entradaFinal || !salidaFinal) {
            await client.query('ROLLBACK');
            return res.status(400).json({
                success: false,
                message: 'Se requieren hora de entrada y salida'
            });
        }

        // ── Calcular estado real basado en la hora del horario ──
        let estadoEntrada = 'puntual';

        // Si NO usa horario (horas manuales), intentar obtener horario para clasificar
        if (!usar_horario && !horaHorarioEntrada) {
            // Buscar la hora programada del horario para ese día
            const fechaObj = new Date(`${fecha}T12:00:00`);
            const diasSemana = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
            const diaSemana = diasSemana[fechaObj.getDay()];

            if (empleado.configuracion) {
                const config = typeof empleado.configuracion === 'string'
                    ? JSON.parse(empleado.configuracion)
                    : empleado.configuracion;

                if (config.configuracion_semanal && config.configuracion_semanal[diaSemana]) {
                    const turnos = config.configuracion_semanal[diaSemana];
                    if (turnos && turnos.length > 0) {
                        horaHorarioEntrada = turnos[0].inicio || turnos[0].entrada;
                    }
                } else if (config.dias && config.dias.includes(diaSemana) && config.turnos?.length > 0) {
                    horaHorarioEntrada = config.turnos[0].inicio || config.turnos[0].entrada;
                }
            }
        }

        // Clasificar solo si tenemos el horario de referencia y tolerancia
        if (horaHorarioEntrada && empleado.minutos_retardo != null) {
            const [hE, mE] = entradaFinal.split(':').map(Number);
            const [hH, mH] = horaHorarioEntrada.split(':').map(Number);
            const minutosTarde = (hE * 60 + mE) - (hH * 60 + mH);

            const tolRetardo = empleado.minutos_retardo || 10;
            const tolA = empleado.minutos_retardo_a_max || 20;
            const tolB = empleado.minutos_retardo_b_max || 29;
            const tolFalta = empleado.minutos_falta || 30;

            if (minutosTarde <= tolRetardo) {
                estadoEntrada = 'puntual';
            } else if (minutosTarde <= tolA) {
                estadoEntrada = 'retardo_a';
            } else if (minutosTarde <= tolB) {
                estadoEntrada = 'retardo_b';
            } else {
                estadoEntrada = 'falta';
            }
        }

        // ── Crear timestamps completos ──
        const fechaEntrada = `${fecha} ${entradaFinal}:00`;
        const fechaSalida = `${fecha} ${salidaFinal}:00`;

        // ── Insertar Entrada (con empresa_id y departamento_id) ──
        const idEntrada = await generateId(ID_PREFIXES.ASISTENCIA);
        await client.query(`
            INSERT INTO asistencias(id, estado, dispositivo_origen, fecha_registro, empleado_id, departamento_id, tipo, empresa_id, ubicacion)
            VALUES($1, $2, 'manual', $3, $4, $5, 'entrada', $6, '{"Registro Manual Admin"}')
        `, [idEntrada, estadoEntrada, fechaEntrada, empleado_id, deptoId, empresaId]);

        // ── Insertar Salida ──
        const idSalida = await generateId(ID_PREFIXES.ASISTENCIA);
        await client.query(`
            INSERT INTO asistencias(id, estado, dispositivo_origen, fecha_registro, empleado_id, departamento_id, tipo, empresa_id, ubicacion)
            VALUES($1, 'salida_puntual', 'manual', $2, $3, $4, 'salida', $5, '{"Registro Manual Admin"}')
        `, [idSalida, fechaSalida, empleado_id, deptoId, empresaId]);

        // ── Insertar Evento ──
        const idEvento = await generateId(ID_PREFIXES.EVENTO);
        const usuarioModificadorId = req.usuario?.id || admin_id;

        await client.query(`
            INSERT INTO eventos(id, titulo, descripcion, tipo_evento, prioridad, empleado_id, detalles)
            VALUES($1, $2, $3, 'asistencia_manual', 'alta', $4, $5)
        `, [
            idEvento,
            'Asistencia Manual Registrada',
            `Se registró asistencia manual para ${empleado.nombre} el día ${fecha}. Estado: ${estadoEntrada}. Motivo: ${motivo || 'Sin motivo'}`,
            empleado_id,
            JSON.stringify({
                fecha,
                entrada: entradaFinal,
                salida: salidaFinal,
                estado: estadoEntrada,
                registrado_por: usuarioModificadorId,
                usuario_modificador_id: usuarioModificadorId,
                motivo
            })
        ]);

        await client.query('COMMIT');

        // ── SSE ──
        broadcast('nueva-asistencia', {
            id: idEntrada,
            empleado_id,
            empleado_nombre: empleado.nombre,
            estado: estadoEntrada,
            tipo: 'entrada',
            fecha: fechaEntrada
        });

        res.status(201).json({
            success: true,
            message: `Asistencia registrada como ${estadoEntrada.replace('_', ' ')}`,
            data: {
                entrada: { id: idEntrada, hora: entradaFinal, estado: estadoEntrada },
                salida: { id: idSalida, hora: salidaFinal }
            }
        });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error en registrarAsistenciaManual:', error);
        res.status(500).json({
            success: false,
            message: 'Error al registrar asistencia manual',
            error: error.message
        });
    } finally {
        client.release();
    }
}

/**
 * GET /api/asistencias/empleado/:empleadoId/equivalencias
 * Calcula faltas equivalentes por acumulación de Retardo A/B en un período.
 * 
 * Query params:
 *   - inicio: YYYY-MM-DD (default: primer día del mes actual)
 *   - fin:    YYYY-MM-DD (default: hoy)
 */
export async function getEquivalenciasEmpleado(req, res) {
    try {
        const { empleadoId } = req.params;
        const hoy = new Date();
        const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString().split('T')[0];
        const {
            inicio = inicioMes,
            fin = hoy.toISOString().split('T')[0]
        } = req.query;

        // Obtener tolerancia del empleado (para equivalencias configuradas)
        const tolRes = await pool.query(`
            SELECT t.equivalencia_retardo_a, t.equivalencia_retardo_b
            FROM tolerancias t
            INNER JOIN roles r ON r.tolerancia_id = t.id
            INNER JOIN usuarios_roles ur ON ur.rol_id = r.id
            INNER JOIN empleados e ON e.usuario_id = ur.usuario_id
            WHERE e.id = $1 AND ur.es_activo = true
            ORDER BY r.posicion DESC
            LIMIT 1
        `, [empleadoId]);

        const eqA = tolRes.rows[0]?.equivalencia_retardo_a ?? 10;
        const eqB = tolRes.rows[0]?.equivalencia_retardo_b ?? 5;

        // Conteos del período
        const statsRes = await pool.query(`
            SELECT
                COUNT(*) FILTER (WHERE estado = 'retardo_a')                           AS retardos_a,
                COUNT(*) FILTER (WHERE estado = 'retardo_b')                           AS retardos_b,
                COUNT(*) FILTER (WHERE estado IN ('falta', 'falta_por_retardo')
                                  AND dispositivo_origen != 'sistema')                 AS faltas_directas,
                COUNT(*) FILTER (WHERE estado IN ('falta', 'falta_por_retardo')
                                  AND dispositivo_origen = 'sistema')                  AS faltas_por_acumulacion
            FROM asistencias
            WHERE empleado_id = $1
              AND tipo = 'entrada'
              AND fecha_registro::date BETWEEN $2 AND $3
        `, [empleadoId, inicio, fin]);

        const s = statsRes.rows[0];
        const retA = parseInt(s.retardos_a) || 0;
        const retB = parseInt(s.retardos_b) || 0;
        const faltasPorA = Math.floor(retA / eqA);
        const faltasPorB = Math.floor(retB / eqB);
        const faltasEquivalentes = faltasPorA + faltasPorB;
        const faltasDirectas = parseInt(s.faltas_directas) || 0;
        const faltasTotal = faltasDirectas + faltasEquivalentes + (parseInt(s.faltas_por_acumulacion) || 0);

        // Notas malas (Art. 80): 1 nota c/2 RetA, 1 nota por RetB
        const notasMalas = Math.floor(retA / 2) + retB;

        res.json({
            success: true,
            data: {
                periodo: { inicio, fin },
                retardos_a: retA,
                retardos_b: retB,
                faltas_directas: faltasDirectas,
                faltas_por_acumulacion_sistema: parseInt(s.faltas_por_acumulacion) || 0,
                faltas_equivalentes_por_retardos: faltasEquivalentes,
                faltas_totales: faltasTotal,
                notas_malas_acumuladas: notasMalas,
                configuracion_equivalencias: {
                    retardos_a_por_falta: eqA,
                    retardos_b_por_falta: eqB,
                    art_80a_retardos_a_por_nota: 2,
                    art_80b_retardos_b_por_nota: 1
                },
                desglose_equivalencias: {
                    faltas_por_retardos_a: faltasPorA,
                    retardos_a_restantes: retA % eqA,
                    faltas_por_retardos_b: faltasPorB,
                    retardos_b_restantes: retB % eqB
                }
            }
        });
    } catch (error) {
        console.error('Error en getEquivalenciasEmpleado:', error);
        res.status(500).json({ success: false, message: 'Error al calcular equivalencias' });
    }
}
