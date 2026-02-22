import { pool } from '../config/db.js';
import { generateId, ID_PREFIXES } from '../utils/idGenerator.js';

/**
 * GET /api/avisos
 * Obtiene todos los avisos (para admin)
 */
export async function getAllAvisos(req, res) {
    try {
        const resultado = await pool.query(`
            SELECT 
                a.id, 
                a.titulo, 
                a.contenido, 
                a.es_global,
                a.fecha_registro,
                u.nombre as remitente_nombre
            FROM avisos a
            LEFT JOIN usuarios u ON u.id = a.creado_por
            WHERE a.empresa_id = $1
            ORDER BY a.fecha_registro DESC
        `, [req.empresa_id]);

        // Para cada aviso no global, obtenemos los empleados asignados
        const avisos = await Promise.all(resultado.rows.map(async (aviso) => {
            if (!aviso.es_global) {
                const empleados = await pool.query(`
                    SELECT e.id, u.id as usuario_id, u.nombre
                    FROM empleados e
                    INNER JOIN avisos_empleados ae ON ae.empleado_id = e.id
                    INNER JOIN usuarios u ON u.id = e.usuario_id
                    WHERE ae.aviso_id = $1
                `, [aviso.id]);
                return { ...aviso, empleados: empleados.rows };
            }
            return aviso;
        }));

        res.json({
            success: true,
            data: avisos
        });
    } catch (error) {
        console.error('Error en getAllAvisos:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener avisos'
        });
    }
}

/**
 * GET /api/avisos/globales
 * Obtiene todos los avisos globales ordenados por fecha
 */
export async function getGlobalAvisos(req, res) {
    try {
        const resultado = await pool.query(`
            SELECT 
                a.id, 
                a.titulo, 
                a.contenido, 
                a.fecha_registro,
                u.nombre as remitente_nombre
            FROM avisos a
            LEFT JOIN usuarios u ON u.id = a.creado_por
            WHERE a.es_global = true AND a.empresa_id = $1
            ORDER BY a.fecha_registro DESC
        `, [req.empresa_id]);

        res.json({
            success: true,
            data: resultado.rows
        });
    } catch (error) {
        console.error('Error en getGlobalAvisos:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener avisos globales'
        });
    }
}

/**
 * GET /api/empleados/:id/avisos
 * Obtiene los avisos específicos asignados a un empleado
 */
export async function getAvisosDeEmpleado(req, res) {
    try {
        const { id } = req.params;

        const resultado = await pool.query(`
            SELECT 
                a.id,
                a.titulo,
                a.contenido,
                a.fecha_registro,
                ae.fecha_registro as fecha_asignacion,
                u.nombre as remitente_nombre
            FROM avisos a
            INNER JOIN avisos_empleados ae ON ae.aviso_id = a.id
            LEFT JOIN usuarios u ON u.id = a.creado_por
            WHERE ae.empleado_id = $1 AND a.empresa_id = $2
            ORDER BY ae.fecha_registro DESC
        `, [id, req.empresa_id]);

        res.json({
            success: true,
            data: resultado.rows
        });

    } catch (error) {
        console.error('Error en getAvisosDeEmpleado:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener avisos del empleado'
        });
    }
}

/**
 * POST /api/avisos
 * Crea un nuevo aviso
 */
export async function createAviso(req, res) {
    const client = await pool.connect();
    try {
        const { titulo, contenido, es_global, empleados } = req.body;
        const creado_por = req.usuario.id;

        await client.query('BEGIN');

        // Generar ID único usando el util
        const id = await generateId(ID_PREFIXES.AVISO);

        const insertAviso = await client.query(`
            INSERT INTO avisos (id, titulo, contenido, es_global, creado_por, empresa_id)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING id, titulo, contenido, es_global, fecha_registro, creado_por
        `, [id, titulo, contenido, es_global, creado_por, req.empresa_id]);

        const aviso = insertAviso.rows[0];

        // Agregar nombre del remitente (usuario actual) para que el frontend lo muestre inmediatamente
        if (req.usuario && req.usuario.nombre) {
            aviso.remitente_nombre = req.usuario.nombre;
        }

        if (!es_global && empleados && empleados.length > 0) {
            // Resolver IDs de empleados (pueden venir como USU... o EMP...)
            const empleadosIds = [];
            for (const empId of empleados) {
                if (empId.startsWith('USU')) {
                    const resEmp = await client.query('SELECT id FROM empleados WHERE usuario_id = $1', [empId]);
                    if (resEmp.rows.length > 0) {
                        empleadosIds.push(resEmp.rows[0].id);
                    }
                } else {
                    empleadosIds.push(empId); // Asumimos que es ID de empleado si no empieza con USU
                }
            }

            // Insertar solo IDs únicos
            const uniqueIds = [...new Set(empleadosIds)];

            for (const empleadoId of uniqueIds) {
                await client.query(`
                    INSERT INTO avisos_empleados (aviso_id, empleado_id)
                    VALUES ($1, $2)
                `, [aviso.id, empleadoId]);
            }
        }

        await client.query('COMMIT');

        res.json({
            success: true,
            message: 'Aviso creado correctamente',
            data: aviso
        });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error en createAviso:', error);

        // Si el error es por la secuencia que no existe, intentamos crearla una vez
        if (error.code === '42P01' && error.message.includes('seq_avisos')) {
            try {
                const fixClient = await pool.connect();
                await fixClient.query('CREATE SEQUENCE IF NOT EXISTS seq_avisos');
                fixClient.release();

                res.status(500).json({
                    success: false,
                    message: 'Se inicializó la secuencia de IDs. Por favor intente de nuevo.',
                    error: 'SEQUENCE_CREATED'
                });
                return;
            } catch (e) {
                console.error('Error creando secuencia:', e);
            }
        }

        res.status(500).json({
            success: false,
            message: 'Error al crear el aviso',
            error: error.message
        });
    } finally {
        if (client) client.release();
    }
}

/**
 * PUT /api/avisos/:id
 * Actualiza un aviso existente
 */
export async function updateAviso(req, res) {
    const client = await pool.connect();
    try {
        const { id } = req.params;
        const { titulo, contenido, es_global, empleados } = req.body;

        await client.query('BEGIN');

        const updateAviso = await client.query(`
            UPDATE avisos 
            SET titulo = $1, contenido = $2, es_global = $3
            WHERE id = $4 AND empresa_id = $5
            RETURNING id, titulo, contenido, es_global, fecha_registro
        `, [titulo, contenido, es_global, id, req.empresa_id]);

        if (updateAviso.rowCount === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({
                success: false,
                message: 'Aviso no encontrado'
            });
        }

        // Limpiamos asignaciones existentes
        await client.query('DELETE FROM avisos_empleados WHERE aviso_id = $1', [id]);

        // Si no es global y hay empleados, insertamos las nuevas asignaciones
        if (!es_global && empleados && empleados.length > 0) {
            // Resolver IDs de empleados (pueden venir como USU... o EMP...)
            const empleadosIds = [];
            for (const empId of empleados) {
                if (empId.startsWith('USU')) {
                    const resEmp = await client.query('SELECT id FROM empleados WHERE usuario_id = $1', [empId]);
                    if (resEmp.rows.length > 0) {
                        empleadosIds.push(resEmp.rows[0].id);
                    }
                } else {
                    empleadosIds.push(empId); // Asumimos que es ID de empleado si no empieza con USU
                }
            }

            // Insertar solo IDs únicos
            const uniqueIds = [...new Set(empleadosIds)];

            for (const empleadoId of uniqueIds) {
                await client.query(`
                    INSERT INTO avisos_empleados (aviso_id, empleado_id)
                    VALUES ($1, $2)
                `, [id, empleadoId]);
            }
        }

        await client.query('COMMIT');

        res.json({
            success: true,
            message: 'Aviso actualizado correctamente',
            data: updateAviso.rows[0]
        });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error en updateAviso:', error);
        res.status(500).json({
            success: false,
            message: 'Error al actualizar el aviso'
        });
    } finally {
        client.release();
    }
}

/**
 * DELETE /api/avisos/:id
 * Elimina un aviso
 */
export async function deleteAviso(req, res) {
    const client = await pool.connect();
    try {
        const { id } = req.params;

        await client.query('BEGIN');

        // Eliminar asignaciones primero (por si no hay casada en DB)
        await client.query('DELETE FROM avisos_empleados WHERE aviso_id = $1', [id]);

        // Eliminar el aviso
        const result = await client.query('DELETE FROM avisos WHERE id = $1 AND empresa_id = $2 RETURNING id', [id, req.empresa_id]);

        if (result.rowCount === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({
                success: false,
                message: 'Aviso no encontrado'
            });
        }

        await client.query('COMMIT');

        res.json({
            success: true,
            message: 'Aviso eliminado correctamente'
        });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error en deleteAviso:', error);
        res.status(500).json({
            success: false,
            message: 'Error al eliminar el aviso'
        });
    } finally {
        client.release();
    }
}

/**
 * GET /api/avisos/publicos
 * Obtiene los avisos públicos (globales) sin necesidad de autenticación
 */
export async function getAvisosPublicos(req, res) {
    try {
        const resultado = await pool.query(`
            SELECT 
                a.id, 
                a.titulo, 
                a.contenido, 
                a.fecha_registro,
                u.nombre as remitente_nombre
            FROM avisos a
            LEFT JOIN usuarios u ON u.id = a.creado_por
            WHERE a.es_global = true 
            ORDER BY a.fecha_registro DESC
        `);

        res.json({
            success: true,
            data: resultado.rows
        });
    } catch (error) {
        console.error('Error en getAvisosPublicos:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener avisos públicos'
        });
    }
}
