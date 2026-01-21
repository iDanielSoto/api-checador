import { pool } from '../config/db.js';
import { generateId, ID_PREFIXES } from '../utils/idGenerator.js';

/**
 * POST /api/asistencias/registrar
 * Registra una entrada o salida de asistencia
 */
export async function registrarAsistencia(req, res) {
    try {
        const {
            empleado_id,
            dispositivo_origen,
            ubicacion
        } = req.body;

        if (!empleado_id || !dispositivo_origen) {
            return res.status(400).json({
                success: false,
                message: 'empleado_id y dispositivo_origen son requeridos'
            });
        }

        // Verificar que el empleado existe y está activo
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

        // Obtener último registro del día
        const hoy = new Date();
        hoy.setHours(0, 0, 0, 0);

        const ultimoRegistro = await pool.query(`
            SELECT estado, fecha_registro
            FROM asistencias
            WHERE empleado_id = $1 AND DATE(fecha_registro) = DATE($2)
            ORDER BY fecha_registro DESC
            LIMIT 1
        `, [empleado_id, new Date()]);

        const esEntrada = ultimoRegistro.rows.length === 0 ||
            ['salida_temprano', 'salida_puntual'].includes(ultimoRegistro.rows[0]?.estado);

        // Obtener tolerancia del rol del empleado
        const toleranciaQuery = await pool.query(`
            SELECT t.minutos_retardo, t.minutos_falta, t.permite_registro_anticipado, t.minutos_anticipado_max
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

        // Determinar estado según horario y tolerancias
        const estado = calcularEstadoAsistencia(
            empleado.rows[0].configuracion,
            new Date(),
            tolerancia,
            esEntrada
        );

        // Registrar asistencia
        const id = await generateId(ID_PREFIXES.ASISTENCIA);
        const ubicacionArray = ubicacion ? `{${ubicacion.join(',')}}` : null;

        const resultado = await pool.query(`
            INSERT INTO asistencias (id, estado, dispositivo_origen, ubicacion, empleado_id)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING *
        `, [id, estado, dispositivo_origen, ubicacionArray, empleado_id]);

        // Registrar evento
        const eventoId = await generateId(ID_PREFIXES.EVENTO);
        await pool.query(`
            INSERT INTO eventos (id, titulo, descripcion, tipo_evento, prioridad, empleado_id, detalles)
            VALUES ($1, $2, $3, 'asistencia', 'baja', $4, $5)
        `, [
            eventoId,
            `Registro de ${esEntrada ? 'entrada' : 'salida'} - ${estado}`,
            `${empleado.rows[0].nombre} registró ${esEntrada ? 'entrada' : 'salida'}`,
            empleado_id,
            JSON.stringify({ asistencia_id: id, estado, dispositivo_origen, tipo: esEntrada ? 'entrada' : 'salida' })
        ]);

        res.status(201).json({
            success: true,
            message: `Asistencia registrada como ${estado}`,
            data: {
                ...resultado.rows[0],
                empleado_nombre: empleado.rows[0].nombre,
                tipo: esEntrada ? 'entrada' : 'salida'
            }
        });

    } catch (error) {
        console.error('Error en registrarAsistencia:', error);
        res.status(500).json({
            success: false,
            message: 'Error al registrar asistencia'
        });
    }
}

/**
 * Calcula el estado de la asistencia según horario y tolerancias
 */
function calcularEstadoAsistencia(configuracionHorario, ahora, tolerancia, esEntrada) {
    try {
        if (!configuracionHorario) {
            return esEntrada ? 'puntual' : 'salida_puntual';
        }

        const diasSemana = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
        const diaSemana = diasSemana[ahora.getDay()];

        // Parsear configuración si es string
        let config = typeof configuracionHorario === 'string'
            ? JSON.parse(configuracionHorario)
            : configuracionHorario;

        let turnosHoy = [];

        // Soportar estructura nueva (configuracion_semanal)
        if (config.configuracion_semanal && config.configuracion_semanal[diaSemana]) {
            turnosHoy = config.configuracion_semanal[diaSemana].map(t => ({
                entrada: t.inicio,
                salida: t.fin
            }));
        }
        // Soportar estructura antigua (dias + turnos)
        else if (config.dias && config.dias.includes(diaSemana)) {
            turnosHoy = config.turnos || [];
        }

        // Si no hay turnos para hoy, es día de descanso
        if (turnosHoy.length === 0) {
            return esEntrada ? 'falta' : 'salida_puntual';
        }

        const horaActual = ahora.getHours() * 60 + ahora.getMinutes();

        if (esEntrada) {
            return calcularEstadoEntrada(turnosHoy, horaActual, tolerancia);
        } else {
            return calcularEstadoSalida(turnosHoy, horaActual);
        }

    } catch (error) {
        console.error('Error calculando estado:', error);
        return esEntrada ? 'puntual' : 'salida_puntual';
    }
}

/**
 * Calcula estado de ENTRADA con tolerancias
 */
function calcularEstadoEntrada(turnos, horaActual, tolerancia) {
    for (const turno of turnos) {
        const [horaEntrada, minEntrada] = turno.entrada.split(':').map(Number);
        const minEntradaTurno = horaEntrada * 60 + minEntrada;

        const minutosAnticipado = tolerancia.minutos_anticipado_max || 60;
        const inicioVentana = minEntradaTurno - minutosAnticipado;
        const finToleranciaRetardo = minEntradaTurno + tolerancia.minutos_retardo;
        const finToleranciaFalta = minEntradaTurno + tolerancia.minutos_falta;

        // Dentro de ventana puntual (anticipado + tolerancia retardo)
        if (horaActual >= inicioVentana && horaActual <= finToleranciaRetardo) {
            return 'puntual';
        }

        // Dentro de tolerancia de retardo
        if (horaActual > finToleranciaRetardo && horaActual <= finToleranciaFalta) {
            return 'retardo';
        }

        // Después de tolerancia de falta pero antes de fin de turno
        const [horaSalida, minSalida] = turno.salida.split(':').map(Number);
        const minSalidaTurno = horaSalida * 60 + minSalida;

        if (horaActual > finToleranciaFalta && horaActual <= minSalidaTurno) {
            return 'falta';
        }
    }

    // Si no está en ninguna ventana
    return 'falta';
}

/**
 * Calcula estado de SALIDA
 */
function calcularEstadoSalida(turnos, horaActual) {
    for (const turno of turnos) {
        const [horaSalida, minSalida] = turno.salida.split(':').map(Number);
        const minSalidaTurno = horaSalida * 60 + minSalida;

        const toleranciaSalida = 10;
        const inicioVentanaSalida = minSalidaTurno - toleranciaSalida;

        // Salida anticipada
        if (horaActual < inicioVentanaSalida) {
            return 'salida_temprano';
        }

        // Salida puntual
        if (horaActual >= inicioVentanaSalida) {
            return 'salida_puntual';
        }
    }

    return 'salida_puntual';
}

/**
 * GET /api/asistencias
 * Obtiene registros de asistencia con filtros
 */
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
                u.nombre as empleado_nombre,
                u.foto as empleado_foto,
                CASE 
                    WHEN (
                        SELECT COUNT(*) 
                        FROM asistencias a2 
                        WHERE a2.empleado_id = a.empleado_id 
                        AND DATE(a2.fecha_registro) = DATE(a.fecha_registro)
                        AND a2.fecha_registro < a.fecha_registro
                    ) % 2 = 0 THEN 'entrada'
                    ELSE 'salida'
                END as tipo
            FROM asistencias a
            INNER JOIN empleados e ON e.id = a.empleado_id
            INNER JOIN usuarios u ON u.id = e.usuario_id
            WHERE 1=1
        `;
        const params = [];
        let paramIndex = 1;

        if (empleado_id) {
            query += ` AND a.empleado_id = $${paramIndex++}`;
            params.push(empleado_id);
        }

        if (departamento_id) {
            query += ` AND e.id IN (
                SELECT empleado_id FROM empleados_departamentos
                WHERE departamento_id = $${paramIndex++} AND es_activo = true
            )`;
            params.push(departamento_id);
        }

        if (estado) {
            query += ` AND a.estado = $${paramIndex++}`;
            params.push(estado);
        }

        if (fecha_inicio) {
            query += ` AND a.fecha_registro >= $${paramIndex++}`;
            params.push(fecha_inicio);
        }

        if (fecha_fin) {
            query += ` AND a.fecha_registro <= $${paramIndex++}`;
            params.push(fecha_fin);
        }

        query += ` ORDER BY a.fecha_registro DESC LIMIT $${paramIndex++} OFFSET $${paramIndex}`;
        params.push(parseInt(limit), parseInt(offset));

        const resultado = await pool.query(query, params);

        res.json({
            success: true,
            data: resultado.rows
        });

    } catch (error) {
        console.error('Error en getAsistencias:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener asistencias'
        });
    }
}

/**
 * GET /api/asistencias/empleado/:empleadoId
 * Obtiene asistencias de un empleado específico
 */
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
                CASE 
                    WHEN (
                        SELECT COUNT(*) 
                        FROM asistencias a2 
                        WHERE a2.empleado_id = a.empleado_id 
                        AND DATE(a2.fecha_registro) = DATE(a.fecha_registro)
                        AND a2.fecha_registro < a.fecha_registro
                    ) % 2 = 0 THEN 'entrada'
                    ELSE 'salida'
                END as tipo
            FROM asistencias a
            WHERE a.empleado_id = $1
        `;
        const params = [empleadoId];
        let paramIndex = 2;

        if (fecha_inicio) {
            query += ` AND a.fecha_registro >= $${paramIndex++}`;
            params.push(fecha_inicio);
        }

        if (fecha_fin) {
            query += ` AND a.fecha_registro <= $${paramIndex++}`;
            params.push(fecha_fin);
        }

        query += ` ORDER BY a.fecha_registro DESC`;

        const resultado = await pool.query(query, params);

        // Estadísticas
        const stats = await pool.query(`
            SELECT
                COUNT(*) as total,
                COUNT(*) FILTER (WHERE estado = 'puntual') as puntuales,
                COUNT(*) FILTER (WHERE estado = 'retardo') as retardos,
                COUNT(*) FILTER (WHERE estado = 'falta') as faltas,
                COUNT(*) FILTER (WHERE estado = 'salida_puntual') as salidas_puntuales,
                COUNT(*) FILTER (WHERE estado = 'salida_temprano') as salidas_tempranas
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
        console.error('Error en getAsistenciasEmpleado:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener asistencias del empleado'
        });
    }
}

/**
 * GET /api/asistencias/hoy
 * Obtiene resumen de asistencias del día actual
 */
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
                e.id as empleado_id,
                u.nombre as empleado_nombre,
                u.foto as empleado_foto,
                CASE 
                    WHEN (
                        SELECT COUNT(*) 
                        FROM asistencias a2 
                        WHERE a2.empleado_id = a.empleado_id 
                        AND DATE(a2.fecha_registro) = DATE(a.fecha_registro)
                        AND a2.fecha_registro < a.fecha_registro
                    ) % 2 = 0 THEN 'entrada'
                    ELSE 'salida'
                END as tipo
            FROM asistencias a
            INNER JOIN empleados e ON e.id = a.empleado_id
            INNER JOIN usuarios u ON u.id = e.usuario_id
            WHERE DATE(a.fecha_registro) = DATE($1)
        `;
        const params = [hoy];

        if (departamento_id) {
            query += ` AND e.id IN (
                SELECT empleado_id FROM empleados_departamentos
                WHERE departamento_id = $2 AND es_activo = true
            )`;
            params.push(departamento_id);
        }

        query += ` ORDER BY a.fecha_registro DESC`;

        const resultado = await pool.query(query, params);

        // Resumen
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
        console.error('Error en getAsistenciasHoy:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener asistencias de hoy'
        });
    }
}