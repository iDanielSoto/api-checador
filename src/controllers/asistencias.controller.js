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
            dispositivo_origen,  // 'movil' o 'escritorio'
            ubicacion            // Array [latitud, longitud] o null
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

        const ahora = new Date();
        const diaSemana = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'][ahora.getDay()];

        // Obtener configuración del horario para hoy
        const horarioConfig = empleado.rows[0].configuracion;
        let estado = 'puntual';

        if (horarioConfig && horarioConfig[diaSemana]) {
            const configDia = horarioConfig[diaSemana];

            if (!configDia.descanso && configDia.entrada) {
                const [horaEntrada, minEntrada] = configDia.entrada.split(':').map(Number);
                const horaLimite = new Date(ahora);
                horaLimite.setHours(horaEntrada, minEntrada, 0, 0);

                // Obtener tolerancia del rol del empleado
                const tolerancia = await pool.query(`
                    SELECT t.minutos_retardo
                    FROM tolerancias t
                    INNER JOIN roles r ON r.tolerancia_id = t.id
                    INNER JOIN usuarios_roles ur ON ur.rol_id = r.id
                    INNER JOIN empleados e ON e.usuario_id = ur.usuario_id
                    WHERE e.id = $1 AND ur.es_activo = true
                    LIMIT 1
                `, [empleado_id]);

                const minutosTolerancia = tolerancia.rows[0]?.minutos_retardo || 10;
                horaLimite.setMinutes(horaLimite.getMinutes() + minutosTolerancia);

                if (ahora > horaLimite) {
                    estado = 'retardo';
                }
            }
        }

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
            `Registro de asistencia - ${estado}`,
            `${empleado.rows[0].nombre} registró asistencia`,
            empleado_id,
            JSON.stringify({ asistencia_id: id, estado, dispositivo_origen })
        ]);

        res.status(201).json({
            success: true,
            message: `Asistencia registrada como ${estado}`,
            data: {
                ...resultado.rows[0],
                empleado_nombre: empleado.rows[0].nombre
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
                u.foto as empleado_foto
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
                a.fecha_registro
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
                COUNT(*) FILTER (WHERE estado = 'retardo') as retardos
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
                u.foto as empleado_foto
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
            retardos: resultado.rows.filter(a => a.estado === 'retardo').length
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
