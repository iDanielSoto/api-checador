import { pool } from '../config/db.js';
import { generateId, ID_PREFIXES } from '../utils/idGenerator.js';
import { registrarEvento, TIPOS_EVENTO, PRIORIDADES } from '../utils/eventos.js';

/**
 * GET /api/horarios
 * Obtiene todos los horarios con información del empleado
 */
export async function getHorarios(req, res) {
    try {
        const { es_activo, buscar } = req.query;

        let query = `
            SELECT
                h.id,
                h.fecha_inicio,
                h.fecha_fin,
                h.configuracion,
                h.es_activo,
                json_agg(
                    json_build_object(
                        'id', e.id,
                        'nombre', u.nombre,
                        'correo', u.correo
                    )
                ) FILTER (WHERE e.id IS NOT NULL) as empleados
            FROM horarios h
            LEFT JOIN empleados e ON e.horario_id = h.id
            LEFT JOIN usuarios u ON u.id = e.usuario_id
            WHERE h.empresa_id = $1
        `;
        const params = [req.empresa_id];
        let paramIndex = 2;

        if (es_activo !== undefined) {
            query += ` AND h.es_activo = $${paramIndex++}`;
            params.push(es_activo === 'true');
        }

        if (buscar) {
            query += ` AND u.nombre ILIKE $${paramIndex++}`;
            params.push(`%${buscar}%`);
        }

        query += ` GROUP BY h.id ORDER BY h.fecha_inicio DESC`;

        const resultado = await pool.query(query, params);

        res.json({
            success: true,
            data: resultado.rows
        });

    } catch (error) {
        console.error('Error en getHorarios:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener horarios'
        });
    }
}

/**
 * POST /api/horarios/asignar
 * Asigna un horario existente a uno o varios empleados.
 */
export async function asignarHorario(req, res) {
    const client = await pool.connect();
    try {
        const { horario_id, empleados_ids } = req.body;

        if (!horario_id || !empleados_ids || !Array.isArray(empleados_ids) || empleados_ids.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'horario_id y un array de empleados_ids son requeridos.'
            });
        }

        await client.query('BEGIN');

        // Verificar que el horario existe y pertenece a la empresa
        const horarioExistente = await client.query(
            'SELECT id FROM horarios WHERE id = $1 AND empresa_id = $2',
            [horario_id, req.empresa_id]
        );

        if (horarioExistente.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({
                success: false,
                message: 'Horario no encontrado o no pertenece a esta empresa.'
            });
        }

        // Asignar el horario a los empleados
        // Nota: empleados no tiene empresa_id, se verifica a través de usuarios
        const resultado = await client.query(`
            UPDATE empleados
            SET horario_id = $1
            WHERE id = ANY($2) AND EXISTS (
                SELECT 1 FROM usuarios u WHERE u.id = empleados.usuario_id AND u.empresa_id = $3
            )
            RETURNING id
        `, [horario_id, empleados_ids, req.empresa_id]);

        if (resultado.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({
                success: false,
                message: 'Ninguno de los empleados especificados fue encontrado o pertenece a esta empresa.'
            });
        }

        await client.query('COMMIT');

        // Registrar evento
        await registrarEvento({
            titulo: 'Horario asignado',
            descripcion: `Se asignó el horario ${horario_id} a ${resultado.rows.length} empleado(s).`,
            tipo_evento: TIPOS_EVENTO.HORARIO,
            prioridad: PRIORIDADES.MEDIA,
            empleado_id: empleados_ids[0], // Podríamos registrar para el primer empleado o iterar
            usuario_modificador_id: req.usuario?.id,
            detalles: { horario_id, empleados_ids: resultado.rows.map(row => row.id) }
        });

        res.json({
            success: true,
            message: `Horario ${horario_id} asignado a ${resultado.rows.length} empleado(s) correctamente.`,
            data: {
                horario_id,
                empleados_asignados: resultado.rows.map(row => row.id)
            }
        });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error en asignarHorario:', error);
        res.status(500).json({
            success: false,
            message: 'Error al asignar horario'
        });
    } finally {
        client.release();
    }
}

/**
 * POST /api/horarios/sistema/importar
 * Endpoint para recibir JSON pre-parseado desde el frontend con formato CSV del Tec
 */
export async function importarHorariosCsv(req, res) {
    const client = await pool.connect();
    try {
        const { registros, solo_analizar = false } = req.body;
        
        if (!registros || !Array.isArray(registros)) {
            return res.status(400).json({ 
                success: false, 
                message: 'Formato inválido. Se esperaba un array de registros desde el CSV.' 
            });
        }

        await client.query('BEGIN');

        let procesados = 0;
        let errores = [];
        let resumenAnalisis = [];

        // Precargar empleados (empleados no tiene empresa_id, buscar por u.empresa_id)
        const empleadosRes = await client.query(`
            SELECT e.id, e.rfc, e.horario_id, h.fecha_inicio
            FROM empleados e 
            INNER JOIN usuarios u ON u.id = e.usuario_id 
            LEFT JOIN horarios h ON h.id = e.horario_id
            WHERE u.empresa_id = $1
        `, [req.empresa_id]);
        const empleadosMap = {};
        empleadosRes.rows.forEach(e => {
            if (e.rfc) empleadosMap[e.rfc.toUpperCase().trim()] = e;
        });

        // 1. Agrupar registros por RFC + Fecha_Inicio para permitir múltiples filas por empleado (fusión de turnos)
        const grupos = {};
        for (let i = 0; i < registros.length; i++) {
            const row = registros[i];
            const rfcInput = (row.RFC || '').toUpperCase().trim();
            const csvFechaInicio = row.Fecha_Inicio || row.FechaInicio || new Date().toISOString().split('T')[0];
            
            if (!rfcInput) continue;

            const key = `${rfcInput}_${csvFechaInicio}`;
            if (!grupos[key]) {
                grupos[key] = {
                    rfc: rfcInput,
                    fecha_inicio: csvFechaInicio,
                    filas: [],
                    tipoPeriodo: (row.TipoPeriodo || 'semestral').toLowerCase().trim()
                };
            }
            grupos[key].filas.push({ data: row, num: i + 2 });
        }

        for (const key in grupos) {
            const grupo = grupos[key];
            const rfcInput = grupo.rfc;
            const csvFechaInicio = grupo.fecha_inicio;

            const empleadoDb = empleadosMap[rfcInput];
            if (!empleadoDb) {
                errores.push(`Empleado [${rfcInput}]: No se encontró un empleado activo con este RFC.`);
                continue;
            }

            // Lógica de sobrescritura inteligente
            let targetHorarioId = null;
            let esSobrescritura = false;

            if (empleadoDb.horario_id) {
                const dbFechaInicio = empleadoDb.fecha_inicio ? new Date(empleadoDb.fecha_inicio).toISOString().split('T')[0] : null;
                if (dbFechaInicio === csvFechaInicio) {
                    targetHorarioId = empleadoDb.horario_id;
                    esSobrescritura = true;
                }
            }

            // Construir configuración fusionada de todas las filas del grupo
            const timeReg = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
            const config = { lunes: [], martes: [], miercoles: [], jueves: [], viernes: [], sabado: [], domingo: [] };
            let erroresFila = [];
            
            grupo.filas.forEach(f => {
                const row = f.data;
                const mapDia = (diaKey, csvKeyInicio, csvKeyFin) => {
                    const inicio = row[csvKeyInicio]?.trim();
                    const fin = row[csvKeyFin]?.trim();
                    if (!inicio && !fin) return;

                    if (inicio && (!fin || !timeReg.test(fin))) {
                        erroresFila.push(`Fila ${f.num}: ${diaKey} incompleto o formato inválido.`);
                        return;
                    }
                    if (!inicio || !timeReg.test(inicio)) {
                        erroresFila.push(`Fila ${f.num}: ${diaKey} incompleto o formato inválido.`);
                        return;
                    }

                    if (inicio >= fin) {
                        erroresFila.push(`Fila ${f.num}: ${diaKey} inicio (${inicio}) >= fin (${fin}).`);
                        return;
                    }

                    // Validación de solapamiento dentro del mismo día para este grupo
                    const existeSolapamiento = config[diaKey].find(existente => 
                        (inicio < existente.fin) && (fin > existente.inicio)
                    );

                    if (existeSolapamiento) {
                        erroresFila.push(`Fila ${f.num}: ${diaKey} solapa con otro turno el mismo día (${inicio}-${fin} vs ${existeSolapamiento.inicio}-${existeSolapamiento.fin}).`);
                        return;
                    }

                    config[diaKey].push({ inicio, fin });
                };

                mapDia('lunes', 'Lunes_Inicio', 'Lunes_Fin');
                mapDia('martes', 'Martes_Inicio', 'Martes_Fin');
                mapDia('miercoles', 'Miercoles_Inicio', 'Miercoles_Fin');
                mapDia('jueves', 'Jueves_Inicio', 'Jueves_Fin');
                mapDia('viernes', 'Viernes_Inicio', 'Viernes_Fin');
                mapDia('sabado', 'Sabado_Inicio', 'Sabado_Fin');
                mapDia('domingo', 'Domingo_Inicio', 'Domingo_Fin');
            });

            if (erroresFila.length > 0) {
                errores.push(`ID [${rfcInput}]:\n  - ${erroresFila.slice(0, 3).join('\n  - ')}${erroresFila.length > 3 ? `\n  - (+${erroresFila.length - 3} más)` : ''}`);
                continue;
            }

            const tipoPeriodo = grupo.tipoPeriodo === 'intersemestral' ? 'intersemestral' : 'semestral';

            const configuracionJson = JSON.stringify({
                configuracion_semanal: config,
                tipo_periodo: tipoPeriodo,
                excepciones: {}
            });

            if (solo_analizar) {
                resumenAnalisis.push({
                    rfc: rfcInput,
                    operacion: esSobrescritura ? 'actualizar' : 'crear',
                    detalles: esSobrescritura ? `Actualizar horario del ${csvFechaInicio} (${grupo.filas.length} turnos)` : `Nuevo horario desde el ${csvFechaInicio} (${grupo.filas.length} turnos)`
                });
            } else {
                if (esSobrescritura) {
                    await client.query(`UPDATE horarios SET configuracion = $1 WHERE id = $2`, [configuracionJson, targetHorarioId]);
                } else {
                    const nuevoHorarioId = await generateId(ID_PREFIXES.HORARIO);
                    await client.query(`
                        INSERT INTO horarios (id, fecha_inicio, fecha_fin, configuracion, es_activo, empresa_id)
                        VALUES ($1, $2, null, $3, true, $4)
                    `, [nuevoHorarioId, csvFechaInicio, configuracionJson, req.empresa_id]);
                    await client.query(`UPDATE empleados SET horario_id = $1 WHERE id = $2`, [nuevoHorarioId, empleadoDb.id]);
                }
            }

            procesados++;
        }

        // Si es solo análisis o hubo errores críticos, hacemos rollback
        if (solo_analizar || (procesados === 0 && errores.length > 0)) {
            await client.query('ROLLBACK');
            
            if (solo_analizar) {
                return res.json({
                    success: true,
                    is_analysis: true,
                    resumen: {
                        total: registros.length,
                        procesables: procesados,
                        errores: errores.length,
                        crear: resumenAnalisis.filter(a => a.operacion === 'crear').length,
                        actualizar: resumenAnalisis.filter(a => a.operacion === 'actualizar').length
                    },
                    detalles: resumenAnalisis,
                    notificaciones: errores
                });
            }

            return res.status(400).json({
                success: false,
                message: errores
            });
        }

        await client.query('COMMIT');

        // Registrar evento
        await registrarEvento({
            titulo: 'Horarios importados CSV',
            descripcion: `Se importaron ${procesados} horarios masivamente vía CSV.`,
            tipo_evento: TIPOS_EVENTO.HORARIO,
            prioridad: PRIORIDADES.MEDIA,
            usuario_modificador_id: req.usuario?.id,
            detalles: { procesados, fallidos: errores.length }
        });

        // Modificamos el mensaje si hubo errores pero algunos pasaron
        if (errores.length > 0) {
            return res.json({
                success: true,
                message: [`Importación parcial completada (${procesados} registros).`],
                meta: { procesados, fallidos: errores }
            });
        }

        res.json({
            success: true,
            message: `¡Importación exitosa! Se han procesado y asignado ${procesados} registros correctamente.`,
            meta: { procesados, fallidos: errores }
        });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error en importarHorariosCsv:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error en el servidor al intentar importar horarios masivos.', 
            error: error.message 
        });
    } finally {
        client.release();
    }
}

/**
 * GET /api/horarios/:id
 * Obtiene un horario por ID con información del empleado
 */
export async function getHorarioById(req, res) {
    try {
        const { id } = req.params;

        const resultado = await pool.query(`
            SELECT
                h.id,
                h.fecha_inicio,
                h.fecha_fin,
                h.configuracion,
                h.es_activo,
                json_agg(
                    json_build_object(
                        'id', e.id,
                        'nombre', u.nombre
                    )
                ) FILTER (WHERE e.id IS NOT NULL) as empleados
            FROM horarios h
            LEFT JOIN empleados e ON e.horario_id = h.id
            LEFT JOIN usuarios u ON u.id = e.usuario_id
            WHERE h.id = $1 AND h.empresa_id = $2
            GROUP BY h.id
        `, [id, req.empresa_id]);

        if (resultado.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Horario no encontrado'
            });
        }

        res.json({
            success: true,
            data: resultado.rows[0]
        });

    } catch (error) {
        console.error('Error en getHorarioById:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener horario'
        });
    }
}

/**
 * POST /api/horarios
 * Crea un nuevo horario y lo asigna a un empleado
 */
export async function createHorario(req, res) {
    const client = await pool.connect();

    try {
        const {
            empleado_id,
            empleados_ids,
            fecha_inicio,
            fecha_fin,
            configuracion,
            es_activo = true
        } = req.body;

        if (!fecha_inicio || !configuracion) {
            return res.status(400).json({
                success: false,
                message: 'fecha_inicio y configuracion son requeridos'
            });
        }



        await client.query('BEGIN');

        const id = await generateId(ID_PREFIXES.HORARIO);

        // Crear el horario
        const horarioResult = await client.query(`
            INSERT INTO horarios (id, fecha_inicio, fecha_fin, configuracion, es_activo, empresa_id)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING *
        `, [id, fecha_inicio, fecha_fin, JSON.stringify(configuracion), es_activo, req.empresa_id]);

        const targetIds = empleados_ids || (empleado_id ? [empleado_id] : []);

        // Asignar el horario a los empleados
        if (targetIds.length > 0) {
            await client.query(`
                UPDATE empleados 
                SET horario_id = $1
                WHERE id = ANY($2)
            `, [id, targetIds]);
        }

        await client.query('COMMIT');

        // Registrar evento
        await registrarEvento({
            titulo: 'Horario creado',
            descripcion: `Se creó y asignó un nuevo horario al empleado ${empleado_id}`,
            tipo_evento: TIPOS_EVENTO.HORARIO,
            prioridad: PRIORIDADES.MEDIA,
            empleado_id: empleado_id,
            usuario_modificador_id: req.usuario?.id,
            detalles: { horario_id: id, fecha_inicio, fecha_fin }
        });

        res.status(201).json({
            success: true,
            message: 'Horario creado y asignado correctamente',
            data: {
                ...horarioResult.rows[0],
                empleado_id
            }
        });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error en createHorario:', error);
        res.status(500).json({
            success: false,
            message: 'Error al crear horario'
        });
    } finally {
        client.release();
    }
}

/**
 * PUT /api/horarios/:id
 * Actualiza un horario existente
 */
export async function updateHorario(req, res) {
    const client = await pool.connect();

    try {
        const { id } = req.params;
        const {
            empleado_id,
            empleados_ids,
            fecha_inicio,
            fecha_fin,
            configuracion,
            es_activo
        } = req.body;

        await client.query('BEGIN');

        const configJson = configuracion ? JSON.stringify(configuracion) : null;

        const resultado = await client.query(`
            UPDATE horarios SET
                fecha_inicio = COALESCE($1, fecha_inicio),
                fecha_fin = $2,
                configuracion = COALESCE($3, configuracion),
                es_activo = COALESCE($4, es_activo)
            WHERE id = $5 AND empresa_id = $6
            RETURNING *
        `, [fecha_inicio, fecha_fin, configJson, es_activo, id, req.empresa_id]);

        if (resultado.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({
                success: false,
                message: 'Horario no encontrado'
            });
        }

        const targetIds = empleados_ids || (empleado_id ? [empleado_id] : null);

        // Si se proporciona empleados_ids o empleado_id explícitamente, actualizar la asignación
        if (targetIds !== null) {
            // Primero, quitar este horario de todos los empleados
            await client.query(`
                UPDATE empleados 
                SET horario_id = NULL
                WHERE horario_id = $1
            `, [id]);

            // Asignar a los nuevos empleados seleccionados
            if (targetIds.length > 0) {
                await client.query(`
                    UPDATE empleados 
                    SET horario_id = $1
                    WHERE id = ANY($2)
                `, [id, targetIds]);
            }
        }

        await client.query('COMMIT');

        // Registrar evento
        await registrarEvento({
            titulo: 'Horario actualizado',
            descripcion: `Se actualizó el horario ${id}`,
            tipo_evento: TIPOS_EVENTO.HORARIO,
            prioridad: PRIORIDADES.BAJA,
            empleado_id: empleado_id,
            usuario_modificador_id: req.usuario?.id,
            detalles: { horario_id: id, cambios: req.body }
        });

        res.json({
            success: true,
            message: 'Horario actualizado correctamente',
            data: {
                ...resultado.rows[0],
                empleado_id
            }
        });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error en updateHorario:', error);
        res.status(500).json({
            success: false,
            message: 'Error al actualizar horario'
        });
    } finally {
        client.release();
    }
}

/**
 * DELETE /api/horarios/:id
 * Desactiva un horario (soft delete)
 */
export async function deleteHorario(req, res) {
    const client = await pool.connect();

    try {
        const { id } = req.params;

        await client.query('BEGIN');

        // Verificar si tiene empleados asignados
        const empleados = await client.query(
            'SELECT COUNT(*) FROM empleados WHERE horario_id = $1',
            [id]
        );

        // Si tiene empleados, quitar la asignación
        if (parseInt(empleados.rows[0].count) > 0) {
            await client.query(
                'UPDATE empleados SET horario_id = NULL WHERE horario_id = $1',
                [id]
            );
        }

        // Desactivar el horario
        const resultado = await client.query(`
            UPDATE horarios SET es_activo = false
            WHERE id = $1 AND empresa_id = $2
            RETURNING id
        `, [id, req.empresa_id]);

        if (resultado.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({
                success: false,
                message: 'Horario no encontrado'
            });
        }

        await client.query('COMMIT');

        // Registrar evento
        await registrarEvento({
            titulo: 'Horario desactivado',
            descripcion: `Se desactivó el horario ${id}`,
            tipo_evento: TIPOS_EVENTO.HORARIO,
            prioridad: PRIORIDADES.ALTA,
            usuario_modificador_id: req.usuario?.id,
            detalles: { horario_id: id }
        });

        res.json({
            success: true,
            message: 'Horario desactivado correctamente'
        });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error en deleteHorario:', error);
        res.status(500).json({
            success: false,
            message: 'Error al eliminar horario'
        });
    } finally {
        client.release();
    }
}

/**
 * PATCH /api/horarios/:id/reactivar
 * Reactiva un horario desactivado (soft delete inverso)
 */
export async function reactivarHorario(req, res) {
    try {
        const { id } = req.params;

        const resultado = await pool.query(`
            UPDATE horarios SET es_activo = true
            WHERE id = $1 AND es_activo = false AND empresa_id = $2
            RETURNING id
        `, [id, req.empresa_id]);

        if (resultado.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Horario no encontrado o ya está activo'
            });
        }

        await registrarEvento({
            titulo: 'Horario reactivado',
            descripcion: `Se reactivó el horario ${id}`,
            tipo_evento: TIPOS_EVENTO.HORARIO,
            prioridad: PRIORIDADES.MEDIA,
            usuario_modificador_id: req.usuario?.id,
            detalles: { horario_id: id }
        });

        res.json({
            success: true,
            message: 'Horario reactivado correctamente'
        });

    } catch (error) {
        console.error('Error en reactivarHorario:', error);
        res.status(500).json({
            success: false,
            message: 'Error al reactivar horario'
        });
    }
}

/**
 * GET /api/horarios/empleado/:empleadoId
 * Obtiene el horario actual de un empleado
 */
export async function getHorarioByEmpleado(req, res) {
    try {
        const { empleadoId } = req.params;

        const resultado = await pool.query(`
            SELECT
                h.id,
                h.fecha_inicio,
                h.fecha_fin,
                h.configuracion,
                h.es_activo
            FROM horarios h
            INNER JOIN empleados e ON e.horario_id = h.id
            WHERE e.id = $1 AND h.es_activo = true
        `, [empleadoId]);

        if (resultado.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'El empleado no tiene horario asignado'
            });
        }

        res.json({
            success: true,
            data: resultado.rows[0]
        });

    } catch (error) {
        console.error('Error en getHorarioByEmpleado:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener horario del empleado'
        });
    }
}