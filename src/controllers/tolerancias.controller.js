import { pool } from '../config/db.js';
import { generateId, ID_PREFIXES } from '../utils/idGenerator.js';

/**
 * GET /api/tolerancias
 * Obtiene todas las tolerancias
 */
export async function getTolerancias(req, res) {
    try {
        const { es_activo } = req.query;

        let query = `
            SELECT
                t.id,
                t.nombre,
                t.minutos_retardo,
                t.minutos_falta,
                t.permite_registro_anticipado,
                t.minutos_anticipado_max,
                t.aplica_tolerancia_entrada,
                t.aplica_tolerancia_salida,
                t.dias_aplica,
                t.fecha_registro,
                t.es_activo,
                r.id as rol_id,
                r.nombre as rol_nombre
            FROM tolerancias t
            LEFT JOIN roles r ON r.tolerancia_id = t.id
        `;

        const params = [req.empresa_id];
        let paramIndex = 2;
        if (es_activo !== undefined) {
            query += ` WHERE t.empresa_id = $1 AND t.es_activo = $${paramIndex++}`;
            params.push(es_activo === 'true');
        } else {
            query += ` WHERE t.empresa_id = $1 AND t.es_activo = true`;
        }

        query += ` ORDER BY t.nombre ASC`;

        const resultado = await pool.query(query, params);

        res.json({
            success: true,
            data: resultado.rows
        });

    } catch (error) {
        console.error('Error en getTolerancias:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener tolerancias'
        });
    }
}

/**
 * GET /api/tolerancias/:id
 * Obtiene una tolerancia por ID
 */
export async function getToleranciaById(req, res) {
    try {
        const { id } = req.params;

        const resultado = await pool.query(`
            SELECT t.*, r.id as rol_id, r.nombre as rol_nombre
            FROM tolerancias t
            LEFT JOIN roles r ON r.tolerancia_id = t.id
            WHERE t.id = $1 AND t.empresa_id = $2
        `, [id, req.empresa_id]);

        if (resultado.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Tolerancia no encontrada'
            });
        }

        // Obtener roles que usan esta tolerancia
        const roles = await pool.query(`
            SELECT id, nombre FROM roles WHERE tolerancia_id = $1
        `, [id]);

        res.json({
            success: true,
            data: {
                ...resultado.rows[0],
                roles: roles.rows
            }
        });

    } catch (error) {
        console.error('Error en getToleranciaById:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener tolerancia'
        });
    }
}

/**
 * POST /api/tolerancias
 * Crea una nueva tolerancia
 */
export async function createTolerancia(req, res) {
    const client = await pool.connect();

    try {
        let {
            nombre,
            minutos_retardo = 10,
            minutos_falta = 30,
            permite_registro_anticipado = true,
            minutos_anticipado_max = 60,
            aplica_tolerancia_entrada = true,
            aplica_tolerancia_salida = false,
            dias_aplica,
            rol_id // Si se envía, es para asignar esta tolerancia al rol
        } = req.body;

        // Si no se envía nombre pero sí rol_id, tomar el nombre del rol
        if (!nombre && rol_id) {
            const rol = await client.query('SELECT nombre FROM roles WHERE id = $1', [rol_id]);
            if (rol.rows.length > 0) {
                nombre = `Tolerancia - ${rol.rows[0].nombre}`;
            }
        }

        if (!nombre) {
            client.release();
            return res.status(400).json({
                success: false,
                message: 'El nombre es requerido (o proporciona un rol_id para generar uno automático)'
            });
        }

        await client.query('BEGIN');

        const id = await generateId(ID_PREFIXES.TOLERANCIA);

        // 1. Insertar tolerancia (SIN rol_id, ya que la FK está en roles)
        const resultado = await client.query(`
            INSERT INTO tolerancias (
                id, nombre, minutos_retardo, minutos_falta,
                permite_registro_anticipado, minutos_anticipado_max,
                aplica_tolerancia_entrada, aplica_tolerancia_salida, dias_aplica, empresa_id
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            RETURNING *
        `, [
            id, nombre, minutos_retardo, minutos_falta,
            permite_registro_anticipado, minutos_anticipado_max,
            aplica_tolerancia_entrada, aplica_tolerancia_salida,
            dias_aplica ? JSON.stringify(dias_aplica) : null,
            req.empresa_id
        ]);

        // 2. Si se especificó un rol, actualizar el rol para que apunte a esta tolerancia
        if (rol_id) {
            await client.query(`
                UPDATE roles SET tolerancia_id = $1 WHERE id = $2
            `, [id, rol_id]);
        }

        await client.query('COMMIT');

        res.status(201).json({
            success: true,
            message: 'Tolerancia creada correctamente',
            data: {
                ...resultado.rows[0],
                rol_id: rol_id || null // Devolver rol_id para que el frontend lo reconozca
            }
        });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error en createTolerancia:', error);
        res.status(500).json({
            success: false,
            message: 'Error al crear tolerancia'
        });
    } finally {
        client.release();
    }
}

/**
 * PUT /api/tolerancias/:id
 * Actualiza una tolerancia existente
 */
export async function updateTolerancia(req, res) {
    const client = await pool.connect();

    try {
        const { id } = req.params;
        const {
            nombre,
            minutos_retardo,
            minutos_falta,
            permite_registro_anticipado,
            minutos_anticipado_max,
            aplica_tolerancia_entrada,
            aplica_tolerancia_salida,
            dias_aplica,
            rol_id
        } = req.body;

        const diasJson = dias_aplica ? JSON.stringify(dias_aplica) : null;

        await client.query('BEGIN');

        // 1. Actualizar tolerancia
        const resultado = await client.query(`
            UPDATE tolerancias SET
                nombre = COALESCE($1, nombre),
                minutos_retardo = COALESCE($2, minutos_retardo),
                minutos_falta = COALESCE($3, minutos_falta),
                permite_registro_anticipado = COALESCE($4, permite_registro_anticipado),
                minutos_anticipado_max = COALESCE($5, minutos_anticipado_max),
                aplica_tolerancia_entrada = COALESCE($6, aplica_tolerancia_entrada),
                aplica_tolerancia_salida = COALESCE($7, aplica_tolerancia_salida),
                dias_aplica = COALESCE($8, dias_aplica)
            WHERE id = $9 AND empresa_id = $10
            RETURNING *
        `, [
            nombre, minutos_retardo, minutos_falta,
            permite_registro_anticipado, minutos_anticipado_max,
            aplica_tolerancia_entrada, aplica_tolerancia_salida,
            diasJson, id, req.empresa_id
        ]);

        if (resultado.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({
                success: false,
                message: 'Tolerancia no encontrada'
            });
        }

        // 2. Si se especificó un rol, actualizar el rol
        if (rol_id !== undefined) {
            // Si rol_id es null, significa desvincular? 
            // La lógica actual de createTolerancia (anterior) permitía null.
            // Si se envía un ID, asignamos. Si se envía null, quizás desasignamos?
            // Asumiremos que si se envía un valor explícito, se actualiza.
            if (rol_id) {
                // Verificar si este rol ya tenía otra tolerancia y reemplazarla
                await client.query(`UPDATE roles SET tolerancia_id = $1 WHERE id = $2`, [id, rol_id]);
            } else {
                // Si rol_id es null o false, no hacemos nada o desvinculamos?
                // El frontend envía rol_id=null para "General". Pero "General" no es un rol en la DB.
                // Si estoy editando la tolerancia "General", rol_id será null.
                // No necesitamos actualizar roles en ese caso.
            }
        }

        await client.query('COMMIT');

        res.json({
            success: true,
            message: 'Tolerancia actualizada correctamente',
            data: {
                ...resultado.rows[0],
                rol_id: rol_id || null
            }
        });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error en updateTolerancia:', error);
        res.status(500).json({
            success: false,
            message: 'Error al actualizar tolerancia'
        });
    } finally {
        client.release();
    }
}

/**
 * DELETE /api/tolerancias/:id
 * Desactiva una tolerancia (soft delete)
 */
export async function deleteTolerancia(req, res) {
    try {
        const { id } = req.params;

        const resultado = await pool.query(`
            UPDATE tolerancias SET es_activo = false WHERE id = $1 AND empresa_id = $2 RETURNING id, nombre
        `, [id, req.empresa_id]);

        if (resultado.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Tolerancia no encontrada'
            });
        }

        res.json({
            success: true,
            message: 'Tolerancia desactivada correctamente'
        });

    } catch (error) {
        console.error('Error en deleteTolerancia:', error);
        res.status(500).json({
            success: false,
            message: 'Error al desactivar tolerancia'
        });
    }
}
