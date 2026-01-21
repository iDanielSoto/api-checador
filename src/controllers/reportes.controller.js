import { pool } from '../config/db.js';

/**
 * GET /api/reportes/estadisticas-globales
 * Obtiene estadísticas globales del sistema
 */
export async function getEstadisticasGlobales(req, res) {
    try {
        const { fecha_inicio, fecha_fin } = req.query;

        let whereClause = '';
        const params = [];

        if (fecha_inicio && fecha_fin) {
            whereClause = 'WHERE a.fecha_registro BETWEEN $1 AND $2';
            params.push(fecha_inicio, fecha_fin);
        } else if (fecha_inicio) {
            whereClause = 'WHERE a.fecha_registro >= $1';
            params.push(fecha_inicio);
        } else if (fecha_fin) {
            whereClause = 'WHERE a.fecha_registro <= $1';
            params.push(fecha_fin);
        }

        // Estadísticas de asistencias
        const asistencias = await pool.query(`
            SELECT
                COUNT(*) FILTER (WHERE estado = 'puntual') as puntuales,
                COUNT(*) FILTER (WHERE estado = 'retardo') as retardos,
                COUNT(*) FILTER (WHERE estado = 'falta') as faltas,
                COUNT(*) FILTER (WHERE estado IN ('salida_puntual', 'salida_temprano')) as salidas,
                COUNT(*) as total
            FROM asistencias a
            ${whereClause}
        `, params);

        // Estadísticas de incidencias
        const incidencias = await pool.query(`
            SELECT
                tipo,
                COUNT(*) as total,
                COUNT(*) FILTER (WHERE estado = 'aprobado') as aprobadas,
                COUNT(*) FILTER (WHERE estado = 'rechazado') as rechazadas,
                COUNT(*) FILTER (WHERE estado = 'pendiente') as pendientes
            FROM incidencias
            ${whereClause.replace('a.fecha_registro', 'fecha_inicio')}
            GROUP BY tipo
        `, params);

        res.json({
            success: true,
            data: {
                asistencias: asistencias.rows[0],
                incidencias: incidencias.rows
            }
        });

    } catch (error) {
        console.error('Error en getEstadisticasGlobales:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener estadísticas globales'
        });
    }
}

/**
 * GET /api/reportes/estadisticas-empleado/:empleadoId
 * Obtiene estadísticas de un empleado específico
 */
export async function getEstadisticasEmpleado(req, res) {
    try {
        const { empleadoId } = req.params;
        const { fecha_inicio, fecha_fin } = req.query;

        let whereClause = 'WHERE empleado_id = $1';
        const params = [empleadoId];
        let paramIndex = 2;

        if (fecha_inicio) {
            whereClause += ` AND fecha_registro >= $${paramIndex++}`;
            params.push(fecha_inicio);
        }
        if (fecha_fin) {
            whereClause += ` AND fecha_registro <= $${paramIndex++}`;
            params.push(fecha_fin);
        }

        // Datos del empleado
        const empleado = await pool.query(`
            SELECT e.id, u.nombre, u.correo, e.rfc
            FROM empleados e
            INNER JOIN usuarios u ON u.id = e.usuario_id
            WHERE e.id = $1
        `, [empleadoId]);

        if (empleado.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Empleado no encontrado'
            });
        }

        // Estadísticas de asistencias
        const asistencias = await pool.query(`
            SELECT
                COUNT(*) FILTER (WHERE estado = 'puntual') as puntuales,
                COUNT(*) FILTER (WHERE estado = 'retardo') as retardos,
                COUNT(*) FILTER (WHERE estado = 'falta') as faltas,
                COUNT(*) FILTER (WHERE estado IN ('salida_puntual', 'salida_temprano')) as salidas,
                COUNT(*) as total
            FROM asistencias
            ${whereClause}
        `, params);

        // Estadísticas de incidencias
        const incidencias = await pool.query(`
            SELECT
                tipo,
                COUNT(*) as total,
                COUNT(*) FILTER (WHERE estado = 'aprobado') as aprobadas,
                COUNT(*) FILTER (WHERE estado = 'rechazado') as rechazadas,
                COUNT(*) FILTER (WHERE estado = 'pendiente') as pendientes
            FROM incidencias
            ${whereClause.replace('fecha_registro', 'fecha_inicio')}
            GROUP BY tipo
        `, params);

        res.json({
            success: true,
            data: {
                empleado: empleado.rows[0],
                asistencias: asistencias.rows[0],
                incidencias: incidencias.rows
            }
        });

    } catch (error) {
        console.error('Error en getEstadisticasEmpleado:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener estadísticas del empleado'
        });
    }
}

/**
 * GET /api/reportes/estadisticas-departamento/:departamentoId
 * Obtiene estadísticas de un departamento
 */
export async function getEstadisticasDepartamento(req, res) {
    try {
        const { departamentoId } = req.params;
        const { fecha_inicio, fecha_fin } = req.query;

        // Datos del departamento
        const departamento = await pool.query(`
            SELECT id, nombre, descripcion
            FROM departamentos
            WHERE id = $1
        `, [departamentoId]);

        if (departamento.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Departamento no encontrado'
            });
        }

        // Empleados del departamento
        const empleados = await pool.query(`
            SELECT empleado_id
            FROM empleados_departamentos
            WHERE departamento_id = $1 AND es_activo = true
        `, [departamentoId]);

        const empleadosIds = empleados.rows.map(e => e.empleado_id);

        if (empleadosIds.length === 0) {
            return res.json({
                success: true,
                data: {
                    departamento: departamento.rows[0],
                    asistencias: { puntuales: 0, retardos: 0, faltas: 0, salidas: 0, total: 0 },
                    incidencias: []
                }
            });
        }

        let whereClause = `WHERE empleado_id = ANY($1)`;
        const params = [empleadosIds];
        let paramIndex = 2;

        if (fecha_inicio) {
            whereClause += ` AND fecha_registro >= $${paramIndex++}`;
            params.push(fecha_inicio);
        }
        if (fecha_fin) {
            whereClause += ` AND fecha_registro <= $${paramIndex++}`;
            params.push(fecha_fin);
        }

        // Estadísticas de asistencias
        const asistencias = await pool.query(`
            SELECT
                COUNT(*) FILTER (WHERE estado = 'puntual') as puntuales,
                COUNT(*) FILTER (WHERE estado = 'retardo') as retardos,
                COUNT(*) FILTER (WHERE estado = 'falta') as faltas,
                COUNT(*) FILTER (WHERE estado IN ('salida_puntual', 'salida_temprano')) as salidas,
                COUNT(*) as total
            FROM asistencias
            ${whereClause}
        `, params);

        // Estadísticas de incidencias
        const incidencias = await pool.query(`
            SELECT
                tipo,
                COUNT(*) as total,
                COUNT(*) FILTER (WHERE estado = 'aprobado') as aprobadas,
                COUNT(*) FILTER (WHERE estado = 'rechazado') as rechazadas,
                COUNT(*) FILTER (WHERE estado = 'pendiente') as pendientes
            FROM incidencias
            ${whereClause.replace('fecha_registro', 'fecha_inicio')}
            GROUP BY tipo
        `, params);

        res.json({
            success: true,
            data: {
                departamento: departamento.rows[0],
                asistencias: asistencias.rows[0],
                incidencias: incidencias.rows
            }
        });

    } catch (error) {
        console.error('Error en getEstadisticasDepartamento:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener estadísticas del departamento'
        });
    }
}

/**
 * GET /api/reportes/detalle-asistencias
 * Obtiene detalle completo de asistencias para exportar
 */
export async function getDetalleAsistencias(req, res) {
    try {
        const { empleado_id, departamento_id, fecha_inicio, fecha_fin, estado } = req.query;

        let query = `
            SELECT
                a.id,
                a.estado,
                a.fecha_registro,
                a.dispositivo_origen,
                e.id as empleado_id,
                u.nombre as empleado_nombre,
                e.rfc,
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

        query += ` ORDER BY a.fecha_registro DESC`;

        const resultado = await pool.query(query, params);

        res.json({
            success: true,
            data: resultado.rows
        });

    } catch (error) {
        console.error('Error en getDetalleAsistencias:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener detalle de asistencias'
        });
    }
}

/**
 * GET /api/reportes/detalle-incidencias
 * Obtiene detalle completo de incidencias para exportar
 */
export async function getDetalleIncidencias(req, res) {
    try {
        const { empleado_id, departamento_id, fecha_inicio, fecha_fin, tipo, estado } = req.query;

        let query = `
            SELECT
                i.id,
                i.tipo,
                i.motivo,
                i.observaciones,
                i.fecha_inicio,
                i.fecha_fin,
                i.estado,
                e.id as empleado_id,
                u.nombre as empleado_nombre,
                e.rfc
            FROM incidencias i
            INNER JOIN empleados e ON e.id = i.empleado_id
            INNER JOIN usuarios u ON u.id = e.usuario_id
            WHERE 1=1
        `;
        const params = [];
        let paramIndex = 1;

        if (empleado_id) {
            query += ` AND i.empleado_id = $${paramIndex++}`;
            params.push(empleado_id);
        }

        if (departamento_id) {
            query += ` AND e.id IN (
                SELECT empleado_id FROM empleados_departamentos
                WHERE departamento_id = $${paramIndex++} AND es_activo = true
            )`;
            params.push(departamento_id);
        }

        if (tipo) {
            query += ` AND i.tipo = $${paramIndex++}`;
            params.push(tipo);
        }

        if (estado) {
            query += ` AND i.estado = $${paramIndex++}`;
            params.push(estado);
        }

        if (fecha_inicio) {
            query += ` AND i.fecha_inicio >= $${paramIndex++}`;
            params.push(fecha_inicio);
        }

        if (fecha_fin) {
            query += ` AND i.fecha_fin <= $${paramIndex++}`;
            params.push(fecha_fin);
        }

        query += ` ORDER BY i.fecha_inicio DESC`;

        const resultado = await pool.query(query, params);

        res.json({
            success: true,
            data: resultado.rows
        });

    } catch (error) {
        console.error('Error en getDetalleIncidencias:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener detalle de incidencias'
        });
    }
}

/**
 * GET /api/reportes/desempeno
 * Calcula métricas de desempeño basadas en asistencias
 */
export async function getReporteDesempeno(req, res) {
    try {
        const { empleado_id, departamento_id, fecha_inicio, fecha_fin } = req.query;

        let whereEmpleados = '1=1';
        const params = [];
        let paramIndex = 1;

        if (empleado_id) {
            whereEmpleados = `e.id = $${paramIndex++}`;
            params.push(empleado_id);
        } else if (departamento_id) {
            whereEmpleados = `e.id IN (
                SELECT empleado_id FROM empleados_departamentos
                WHERE departamento_id = $${paramIndex++} AND es_activo = true
            )`;
            params.push(departamento_id);
        }

        let whereFechas = '';
        if (fecha_inicio) {
            whereFechas += ` AND a.fecha_registro >= $${paramIndex++}`;
            params.push(fecha_inicio);
        }
        if (fecha_fin) {
            whereFechas += ` AND a.fecha_registro <= $${paramIndex++}`;
            params.push(fecha_fin);
        }

        const query = `
            SELECT
                e.id as empleado_id,
                u.nombre as empleado_nombre,
                e.rfc,
                COUNT(*) FILTER (WHERE a.estado = 'puntual') as puntuales,
                COUNT(*) FILTER (WHERE a.estado = 'retardo') as retardos,
                COUNT(*) FILTER (WHERE a.estado = 'falta') as faltas,
                COUNT(*) as total_registros,
                ROUND(
                    (COUNT(*) FILTER (WHERE a.estado = 'puntual')::decimal / 
                    NULLIF(COUNT(*), 0) * 100), 2
                ) as porcentaje_puntualidad,
                ROUND(
                    (COUNT(*) FILTER (WHERE a.estado = 'retardo')::decimal / 
                    NULLIF(COUNT(*), 0) * 100), 2
                ) as porcentaje_retardos,
                ROUND(
                    (COUNT(*) FILTER (WHERE a.estado = 'falta')::decimal / 
                    NULLIF(COUNT(*), 0) * 100), 2
                ) as porcentaje_faltas
            FROM empleados e
            INNER JOIN usuarios u ON u.id = e.usuario_id
            LEFT JOIN asistencias a ON a.empleado_id = e.id ${whereFechas}
            WHERE ${whereEmpleados}
            GROUP BY e.id, u.nombre, e.rfc
            ORDER BY porcentaje_puntualidad DESC NULLS LAST
        `;

        const resultado = await pool.query(query, params);

        res.json({
            success: true,
            data: resultado.rows
        });

    } catch (error) {
        console.error('Error en getReporteDesempeno:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener reporte de desempeño'
        });
    }
}