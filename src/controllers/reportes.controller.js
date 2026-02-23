import { pool } from '../config/db.js';

/* ============================================================
   ESTADÍSTICAS GLOBALES
============================================================ */
export async function getEstadisticasGlobales(req, res) {
    try {
        const { fecha_inicio, fecha_fin } = req.query;

        let whereAsistencias = '';
        let whereIncidencias = '';
        const paramsAsistencias = [];
        const paramsIncidencias = [];

        if (fecha_inicio && fecha_fin) {
            whereAsistencias = 'WHERE a.fecha_registro BETWEEN $1 AND $2';
            whereIncidencias = 'WHERE fecha_inicio BETWEEN $1 AND $2';
            paramsAsistencias.push(fecha_inicio, fecha_fin);
            paramsIncidencias.push(fecha_inicio, fecha_fin);
        } else if (fecha_inicio) {
            whereAsistencias = 'WHERE a.fecha_registro >= $1';
            whereIncidencias = 'WHERE fecha_inicio >= $1';
            paramsAsistencias.push(fecha_inicio);
            paramsIncidencias.push(fecha_inicio);
        } else if (fecha_fin) {
            whereAsistencias = 'WHERE a.fecha_registro <= $1';
            whereIncidencias = 'WHERE fecha_inicio <= $1';
            paramsAsistencias.push(fecha_fin);
            paramsIncidencias.push(fecha_fin);
        }

        const asistencias = await pool.query(`
            SELECT
                COUNT(*) FILTER (WHERE estado = 'puntual') as puntuales,
                COUNT(*) FILTER (WHERE estado IN ('retardo','retardo_a','retardo_b')) as retardos,
                COUNT(*) FILTER (WHERE estado IN ('falta','falta_por_retardo')) as faltas,
                COUNT(*) FILTER (WHERE estado IN ('puntual','retardo','retardo_a','retardo_b','falta','falta_por_retardo')) as total
            FROM asistencias a
            WHERE a.empresa_id = $1 ${whereAsistencias ? 'AND ' + whereAsistencias.replace('WHERE ', '') : ''}
        `, [req.empresa_id, ...paramsAsistencias]);

        const incidencias = await pool.query(`
            SELECT
                tipo,
                COUNT(*) as total,
                COUNT(*) FILTER (WHERE estado = 'aprobado') as aprobadas,
                COUNT(*) FILTER (WHERE estado = 'rechazado') as rechazadas,
                COUNT(*) FILTER (WHERE estado = 'pendiente') as pendientes
            FROM incidencias
            WHERE empresa_id = $1 ${whereIncidencias ? 'AND ' + whereIncidencias.replace('WHERE ', '') : ''}
            GROUP BY tipo
        `, [req.empresa_id, ...paramsIncidencias]);

        res.json({ success: true, data: { asistencias: asistencias.rows[0], incidencias: incidencias.rows } });

    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Error al obtener estadísticas globales' });
    }
}

/* ============================================================
   ESTADÍSTICAS POR EMPLEADO
============================================================ */
export async function getEstadisticasEmpleado(req, res) {
    try {
        const { empleadoId } = req.params;
        const { fecha_inicio, fecha_fin } = req.query;

        let whereAsistencias = 'WHERE empleado_id = $1';
        let whereIncidencias = 'WHERE empleado_id = $1';
        const paramsAsistencias = [empleadoId];
        const paramsIncidencias = [empleadoId];
        let i = 2;

        if (fecha_inicio) {
            whereAsistencias += ` AND fecha_registro >= $${i}`;
            whereIncidencias += ` AND fecha_inicio >= $${i++}`;
            paramsAsistencias.push(fecha_inicio);
            paramsIncidencias.push(fecha_inicio);
        }
        if (fecha_fin) {
            whereAsistencias += ` AND fecha_registro <= $${i}`;
            whereIncidencias += ` AND fecha_inicio <= $${i++}`;
            paramsAsistencias.push(fecha_fin);
            paramsIncidencias.push(fecha_fin);
        }

        const empleado = await pool.query(`
            SELECT e.id, u.nombre, u.correo, e.rfc
            FROM empleados e
            INNER JOIN usuarios u ON u.id = e.usuario_id
            WHERE e.id = $1
        `, [empleadoId]);

        if (!empleado.rows.length) {
            return res.status(404).json({ success: false, message: 'Empleado no encontrado' });
        }

        const asistencias = await pool.query(`
            SELECT
                COUNT(*) FILTER (WHERE estado IN ('puntual','retardo','retardo_a','retardo_b','falta','falta_por_retardo')) as total,
                COUNT(*) FILTER (WHERE estado = 'puntual') as puntuales,
                COUNT(*) FILTER (WHERE estado IN ('retardo','retardo_a','retardo_b')) as retardos,
                COUNT(*) FILTER (WHERE estado = 'retardo_a') as retardos_a,
                COUNT(*) FILTER (WHERE estado = 'retardo_b') as retardos_b,
                COUNT(*) FILTER (WHERE estado IN ('falta','falta_por_retardo')) as faltas
            FROM asistencias
            WHERE empresa_id = (SELECT empresa_id FROM usuarios u INNER JOIN empleados e ON e.usuario_id = u.id WHERE e.id = $1 LIMIT 1)
            AND ${whereAsistencias.replace('WHERE ', '')}
        `, paramsAsistencias);

        const incidencias = await pool.query(`
            SELECT
                tipo,
                COUNT(*) as total,
                COUNT(*) FILTER (WHERE estado = 'aprobado') as aprobadas,
                COUNT(*) FILTER (WHERE estado = 'rechazado') as rechazadas,
                COUNT(*) FILTER (WHERE estado = 'pendiente') as pendientes
            FROM incidencias
            ${whereIncidencias}
            GROUP BY tipo
        `, paramsIncidencias);

        res.json({
            success: true,
            data: { empleado: empleado.rows[0], asistencias: asistencias.rows[0], incidencias: incidencias.rows }
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Error al obtener estadísticas del empleado' });
    }
}

/* ============================================================
   ESTADÍSTICAS POR DEPARTAMENTO
============================================================ */
export async function getEstadisticasDepartamento(req, res) {
    try {
        const { departamentoId } = req.params;
        const { fecha_inicio, fecha_fin } = req.query;

        const departamento = await pool.query(`SELECT id, nombre, descripcion FROM departamentos WHERE id = $1`, [departamentoId]);
        if (!departamento.rows.length) return res.status(404).json({ success: false, message: 'Departamento no encontrado' });

        let whereAsistencias = `WHERE departamento_id = $1`;
        const paramsAsistencias = [departamentoId];
        let ia = 2;

        if (fecha_inicio) { whereAsistencias += ` AND fecha_registro >= $${ia++}`; paramsAsistencias.push(fecha_inicio); }
        if (fecha_fin) { whereAsistencias += ` AND fecha_registro <= $${ia++}`; paramsAsistencias.push(fecha_fin); }

        const asistencias = await pool.query(`
            SELECT
                COUNT(*) FILTER (WHERE estado = 'puntual') as puntuales,
                COUNT(*) FILTER (WHERE estado IN ('retardo','retardo_a','retardo_b')) as retardos,
                COUNT(*) FILTER (WHERE estado IN ('falta','falta_por_retardo')) as faltas,
                COUNT(*) FILTER (WHERE estado IN ('puntual','retardo','retardo_a','retardo_b','falta','falta_por_retardo')) as total
            FROM asistencias
            ${whereAsistencias}
        `, paramsAsistencias);

        // Incidencias siguen usando empleados del departamento
        const empleados = await pool.query(`SELECT empleado_id FROM empleados_departamentos WHERE departamento_id = $1 AND es_activo = true`, [departamentoId]);
        const ids = empleados.rows.map(e => e.empleado_id);

        let incidencias = { rows: [] };
        if (ids.length > 0) {
            let whereInc = `WHERE empleado_id = ANY($1)`;
            const paramsInc = [ids];
            let ii = 2;
            if (fecha_inicio) { whereInc += ` AND fecha_inicio >= $${ii++}`; paramsInc.push(fecha_inicio); }
            if (fecha_fin) { whereInc += ` AND fecha_inicio <= $${ii++}`; paramsInc.push(fecha_fin); }

            incidencias = await pool.query(`
                SELECT
                    tipo,
                    COUNT(*) as total,
                    COUNT(*) FILTER (WHERE estado = 'aprobado') as aprobadas,
                    COUNT(*) FILTER (WHERE estado = 'rechazado') as rechazadas,
                    COUNT(*) FILTER (WHERE estado = 'pendiente') as pendientes
                FROM incidencias
                ${whereInc}
                GROUP BY tipo
            `, paramsInc);
        }

        res.json({ success: true, data: { departamento: departamento.rows[0], asistencias: asistencias.rows[0], incidencias: incidencias.rows } });

    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Error al obtener estadísticas del departamento' });
    }
}

/* ============================================================
   DETALLE ASISTENCIAS
============================================================ */
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
                e.rfc
            FROM asistencias a
            INNER JOIN empleados e ON e.id = a.empleado_id
            INNER JOIN usuarios u ON u.id = e.usuario_id
            WHERE a.empresa_id = $1
        `;
        const params = [req.empresa_id];
        let i = 2;

        if (empleado_id) { query += ` AND a.empleado_id = $${i++}`; params.push(empleado_id); }
        if (departamento_id) {
            query += ` AND e.id IN (SELECT empleado_id FROM empleados_departamentos WHERE departamento_id = $${i++} AND es_activo = true)`;
            params.push(departamento_id);
        }
        if (estado) { query += ` AND a.estado = $${i++}`; params.push(estado); }
        if (fecha_inicio) { query += ` AND a.fecha_registro >= $${i++}`; params.push(fecha_inicio); }
        if (fecha_fin) { query += ` AND a.fecha_registro <= $${i++}`; params.push(fecha_fin); }

        query += ` ORDER BY a.fecha_registro DESC`;

        const r = await pool.query(query, params);
        res.json({ success: true, data: r.rows });

    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Error al obtener detalle de asistencias' });
    }
}

/* ============================================================
   DETALLE INCIDENCIAS
============================================================ */
export async function getDetalleIncidencias(req, res) {
    try {
        const { empleado_id, departamento_id, fecha_inicio, fecha_fin, tipo, estado } = req.query;

        let query = `
            SELECT
                i.id, i.tipo, i.motivo, i.observaciones,
                i.fecha_inicio, i.fecha_fin, i.estado,
                e.id as empleado_id, u.nombre as empleado_nombre, e.rfc
            FROM incidencias i
            INNER JOIN empleados e ON e.id = i.empleado_id
            INNER JOIN usuarios u ON u.id = e.usuario_id
            WHERE i.empresa_id = $1
        `;
        const params = [req.empresa_id];
        let i = 2;

        if (empleado_id) { query += ` AND i.empleado_id = $${i++}`; params.push(empleado_id); }
        if (departamento_id) {
            query += ` AND e.id IN (SELECT empleado_id FROM empleados_departamentos WHERE departamento_id = $${i++} AND es_activo = true)`;
            params.push(departamento_id);
        }
        if (tipo) { query += ` AND i.tipo = $${i++}`; params.push(tipo); }
        if (estado) { query += ` AND i.estado = $${i++}`; params.push(estado); }
        if (fecha_inicio) { query += ` AND i.fecha_inicio >= $${i++}`; params.push(fecha_inicio); }
        if (fecha_fin) { query += ` AND i.fecha_fin <= $${i++}`; params.push(fecha_fin); }

        query += ` ORDER BY i.fecha_inicio DESC`;

        const r = await pool.query(query, params);
        res.json({ success: true, data: r.rows });

    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Error al obtener detalle de incidencias' });
    }
}

/* ============================================================
   REPORTE DE DESEMPEÑO
============================================================ */
export async function getReporteDesempeno(req, res) {
    try {
        const { empleado_id, departamento_id, fecha_inicio, fecha_fin } = req.query;

        let whereEmpleados = '1=1';
        const params = [];
        let i = 1;

        if (empleado_id) {
            whereEmpleados = `e.id = $${i++}`;
            params.push(empleado_id);
        } else if (departamento_id) {
            whereEmpleados = `
                e.id IN (
                    SELECT empleado_id 
                    FROM empleados_departamentos
                    WHERE departamento_id = $${i++} AND es_activo = true
                )
            `;
            params.push(departamento_id);
        }

        let whereFechas = '';
        if (fecha_inicio) {
            whereFechas += ` AND a.fecha_registro >= $${i++}`;
            params.push(fecha_inicio);
        }
        if (fecha_fin) {
            whereFechas += ` AND a.fecha_registro <= $${i++}`;
            params.push(fecha_fin);
        }

        const query = `
            SELECT
                e.id as empleado_id,
                u.nombre as empleado_nombre,
                e.rfc,
                COUNT(*) FILTER (WHERE a.estado = 'puntual') as puntuales,
                COUNT(*) FILTER (WHERE a.estado IN ('retardo','retardo_a','retardo_b')) as retardos,
                COUNT(*) FILTER (WHERE a.estado IN ('falta','falta_por_retardo')) as faltas,
                COUNT(*) FILTER (WHERE a.estado IN ('puntual','retardo','retardo_a','retardo_b','falta','falta_por_retardo')) as total_registros,
                ROUND(
                    (COUNT(*) FILTER (WHERE a.estado = 'puntual')::decimal / NULLIF(COUNT(*) FILTER (WHERE a.estado IN ('puntual','retardo','retardo_a','retardo_b','falta','falta_por_retardo')),0) * 100), 2
                ) as porcentaje_puntualidad,
                ROUND(
                    (COUNT(*) FILTER (WHERE a.estado IN ('retardo','retardo_a','retardo_b'))::decimal / NULLIF(COUNT(*) FILTER (WHERE a.estado IN ('puntual','retardo','retardo_a','retardo_b','falta','falta_por_retardo')),0) * 100), 2
                ) as porcentaje_retardos,
                ROUND(
                    (COUNT(*) FILTER (WHERE a.estado IN ('falta','falta_por_retardo'))::decimal / NULLIF(COUNT(*) FILTER (WHERE a.estado IN ('puntual','retardo','retardo_a','retardo_b','falta','falta_por_retardo')),0) * 100), 2
                ) as porcentaje_faltas
            FROM empleados e
            INNER JOIN usuarios u ON u.id = e.usuario_id
            LEFT JOIN asistencias a ON a.empleado_id = e.id ${whereFechas}
            WHERE u.empresa_id = $${i++} AND ${whereEmpleados}
            GROUP BY e.id, u.nombre, e.rfc
            ORDER BY porcentaje_puntualidad DESC NULLS LAST
        `;
        params.unshift(req.empresa_id);

        const result = await pool.query(query, params);
        res.json({ success: true, data: result.rows });

    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Error al obtener reporte de desempeño' });
    }
}

export async function getComparativaDepartamentos(req, res) {
    try {
        const { fecha_inicio, fecha_fin } = req.query;

        // Construcción dinámica de filtros de fecha para coincidir con tu estilo
        let whereFechas = '';
        const params = [];
        let i = 1;

        if (fecha_inicio) {
            whereFechas += ` AND a.fecha_registro >= $${i++}`;
            params.push(fecha_inicio);
        }
        if (fecha_fin) {
            whereFechas += ` AND a.fecha_registro <= $${i++}`;
            params.push(fecha_fin);
        }

        // Consulta que une Departamentos -> Empleados -> Asistencias
        // Usa FILTER como en tus otras funciones para mantener consistencia
        const query = `
            SELECT
                d.id,
                d.nombre,
                COUNT(*) FILTER (WHERE a.estado IN ('puntual','retardo','retardo_a','retardo_b','falta','falta_por_retardo')) as total_registros,
                COUNT(*) FILTER (WHERE a.estado = 'puntual') as puntuales,
                COUNT(*) FILTER (WHERE a.estado IN ('retardo','retardo_a','retardo_b')) as retardos,
                COUNT(*) FILTER (WHERE a.estado IN ('falta','falta_por_retardo')) as faltas,
                ROUND(
                    (COUNT(*) FILTER (WHERE a.estado = 'puntual')::decimal / NULLIF(COUNT(*) FILTER (WHERE a.estado IN ('puntual','retardo','retardo_a','retardo_b','falta','falta_por_retardo')),0) * 100), 1
                ) as eficiencia
            FROM departamentos d
            LEFT JOIN asistencias a ON a.departamento_id = d.id ${whereFechas}
            WHERE d.es_activo = true
            GROUP BY d.id, d.nombre
            HAVING COUNT(a.id) > 0
            ORDER BY puntuales DESC
        `;

        const result = await pool.query(query, params);

        res.json({ success: true, data: result.rows });

    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Error al obtener comparativa de departamentos' });
    }
}

/* ============================================================
   REPORTE DE CHECADAS POR QUINCENA (Formato RRHH TecNM)
   GET /api/reportes/checadas/quincena
   Query params: empleado_id, fecha_inicio, fecha_fin
============================================================ */
export async function getReporteChecadasQuincena(req, res) {
    try {
        const { empleado_id, fecha_inicio, fecha_fin } = req.query;

        if (!empleado_id || !fecha_inicio || !fecha_fin) {
            return res.status(400).json({
                success: false,
                message: 'Se requieren empleado_id, fecha_inicio y fecha_fin'
            });
        }

        // Datos del empleado
        const empRes = await pool.query(`
            SELECT e.id, u.nombre, e.rfc, e.nss, e.horario_id, h.configuracion
            FROM empleados e
            INNER JOIN usuarios u ON u.id = e.usuario_id
            LEFT JOIN horarios h ON h.id = e.horario_id
            WHERE e.id = $1 AND u.empresa_id = $2
        `, [empleado_id, req.empresa_id]);

        if (empRes.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Empleado no encontrado' });
        }

        const empleado = empRes.rows[0];
        const horarioConfig = empleado.configuracion
            ? (typeof empleado.configuracion === 'string' ? JSON.parse(empleado.configuracion) : empleado.configuracion)
            : null;

        // Asistencias del período
        const asistRes = await pool.query(`
            SELECT id, tipo, estado, fecha_registro, dispositivo_origen
            FROM asistencias
            WHERE empleado_id = $1
              AND fecha_registro::date BETWEEN $2 AND $3
            ORDER BY fecha_registro ASC
        `, [empleado_id, fecha_inicio, fecha_fin]);

        // Agrupar asistencias por fecha
        const porFecha = {};
        for (const reg of asistRes.rows) {
            const fecha = reg.fecha_registro.toISOString().split('T')[0];
            if (!porFecha[fecha]) porFecha[fecha] = [];
            porFecha[fecha].push(reg);
        }

        // Construir días del período
        const diasSemana = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
        const inicio = new Date(fecha_inicio + 'T00:00:00');
        const fin = new Date(fecha_fin + 'T23:59:59');
        const dias = [];

        for (let d = new Date(inicio); d <= fin; d.setDate(d.getDate() + 1)) {
            const fechaStr = d.toISOString().split('T')[0];
            const diaSemana = diasSemana[d.getDay()];
            const registrosDia = porFecha[fechaStr] || [];

            // Obtener turnos del horario para ese día
            let turnosDia = [];
            if (horarioConfig?.configuracion_semanal?.[diaSemana]) {
                turnosDia = horarioConfig.configuracion_semanal[diaSemana].map(t => ({
                    entrada: t.inicio,
                    salida: t.fin
                }));
            } else if (horarioConfig?.dias?.includes(diaSemana)) {
                turnosDia = (horarioConfig.turnos || []).map(t => ({
                    entrada: t.entrada || t.inicio,
                    salida: t.salida || t.fin
                }));
            }

            const aplica = turnosDia.length > 0;

            // Parear entradas/salidas por turno
            const turnos = [];
            const entradas = registrosDia.filter(r => r.tipo === 'entrada');
            const salidas = registrosDia.filter(r => r.tipo === 'salida');

            const maxTurnos = Math.max(turnosDia.length, Math.ceil(registrosDia.length / 2));
            for (let t = 0; t < maxTurnos; t++) {
                const horarioTurno = turnosDia[t] || null;
                const checadaEntrada = entradas[t] || null;
                const checadaSalida = salidas[t] || null;

                const formatHora = (fecha) => {
                    if (!fecha) return null;
                    const f = new Date(fecha);
                    return `${String(f.getHours()).padStart(2, '0')}:${String(f.getMinutes()).padStart(2, '0')}`;
                };

                turnos.push({
                    turno: t + 1,
                    entrada: {
                        horario: horarioTurno?.entrada || null,
                        checada: formatHora(checadaEntrada?.fecha_registro),
                        estado: checadaEntrada?.estado || null
                    },
                    salida: {
                        horario: horarioTurno?.salida || null,
                        checada: formatHora(checadaSalida?.fecha_registro),
                        estado: checadaSalida?.estado || null
                    }
                });
            }

            dias.push({
                fecha: fechaStr,
                dia_semana: diaSemana,
                aplica,
                turnos: aplica ? turnos : []
            });
        }

        // Calcular número de quincena (1 o 2) y número de quincena del año
        const mesInicio = inicio.getMonth() + 1;
        const diaInicio = inicio.getDate();
        const numQuincena = diaInicio <= 15 ? (mesInicio * 2) - 1 : mesInicio * 2;

        res.json({
            success: true,
            data: {
                empleado: {
                    id: empleado.id,
                    nombre: empleado.nombre,
                    rfc: empleado.rfc,
                    nss: empleado.nss
                },
                quincena: numQuincena,
                periodo: { inicio: fecha_inicio, fin: fecha_fin },
                dias,
                resumen: {
                    total_retardos_a: asistRes.rows.filter(r => r.estado === 'retardo_a').length,
                    total_retardos_b: asistRes.rows.filter(r => r.estado === 'retardo_b').length,
                    total_faltas: asistRes.rows.filter(r => ['falta', 'falta_por_retardo'].includes(r.estado) && r.tipo === 'entrada').length,
                    total_puntuales: asistRes.rows.filter(r => r.estado === 'puntual').length
                }
            }
        });

    } catch (error) {
        console.error('Error en getReporteChecadasQuincena:', error);
        res.status(500).json({ success: false, message: 'Error al generar reporte de quincena' });
    }
}
