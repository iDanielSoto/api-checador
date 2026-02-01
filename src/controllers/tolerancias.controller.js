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
                t.rol_id,
                t.es_activo,
                r.nombre as rol_nombre,
                (SELECT COUNT(*) FROM roles r2 WHERE r2.tolerancia_id = t.id) as roles_count
            FROM tolerancias t
            LEFT JOIN roles r ON r.id = t.rol_id
        `;

        const params = [];
        if (es_activo !== undefined) {
            query += ` WHERE t.es_activo = $1`;
            params.push(es_activo === 'true');
        } else {
            query += ` WHERE t.es_activo = true`;
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
            SELECT t.*, r.nombre as rol_nombre
            FROM tolerancias t
            LEFT JOIN roles r ON r.id = t.rol_id
            WHERE t.id = $1
        `, [id]);

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
            rol_id
        } = req.body;

        // Si no se envía nombre pero sí rol_id, tomar el nombre del rol
        if (!nombre && rol_id) {
            const rol = await pool.query('SELECT nombre FROM roles WHERE id = $1', [rol_id]);
            if (rol.rows.length > 0) {
                nombre = `Tolerancia - ${rol.rows[0].nombre}`;
            }
        }

        if (!nombre) {
            return res.status(400).json({
                success: false,
                message: 'El nombre es requerido (o proporciona un rol_id para generar uno automático)'
            });
        }

        const id = await generateId(ID_PREFIXES.TOLERANCIA);

        const resultado = await pool.query(`
            INSERT INTO tolerancias (
                id, nombre, minutos_retardo, minutos_falta,
                permite_registro_anticipado, minutos_anticipado_max,
                aplica_tolerancia_entrada, aplica_tolerancia_salida, dias_aplica, rol_id
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            RETURNING *
        `, [
            id, nombre, minutos_retardo, minutos_falta,
            permite_registro_anticipado, minutos_anticipado_max,
            aplica_tolerancia_entrada, aplica_tolerancia_salida,
            dias_aplica ? JSON.stringify(dias_aplica) : null,
            rol_id || null
        ]);

        res.status(201).json({
            success: true,
            message: 'Tolerancia creada correctamente',
            data: resultado.rows[0]
        });

    } catch (error) {
        console.error('Error en createTolerancia:', error);
        res.status(500).json({
            success: false,
            message: 'Error al crear tolerancia'
        });
    }
}

/**
 * PUT /api/tolerancias/:id
 * Actualiza una tolerancia existente
 */
export async function updateTolerancia(req, res) {
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

        const resultado = await pool.query(`
            UPDATE tolerancias SET
                nombre = COALESCE($1, nombre),
                minutos_retardo = COALESCE($2, minutos_retardo),
                minutos_falta = COALESCE($3, minutos_falta),
                permite_registro_anticipado = COALESCE($4, permite_registro_anticipado),
                minutos_anticipado_max = COALESCE($5, minutos_anticipado_max),
                aplica_tolerancia_entrada = COALESCE($6, aplica_tolerancia_entrada),
                aplica_tolerancia_salida = COALESCE($7, aplica_tolerancia_salida),
                dias_aplica = COALESCE($8, dias_aplica)
                ${rol_id !== undefined ? ', rol_id = $10' : ''}
            WHERE id = $9
            RETURNING *
        `, [
            nombre, minutos_retardo, minutos_falta,
            permite_registro_anticipado, minutos_anticipado_max,
            aplica_tolerancia_entrada, aplica_tolerancia_salida,
            diasJson, id,
            ...(rol_id !== undefined ? [rol_id || null] : [])
        ]);

        if (resultado.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Tolerancia no encontrada'
            });
        }

        res.json({
            success: true,
            message: 'Tolerancia actualizada correctamente',
            data: resultado.rows[0]
        });

    } catch (error) {
        console.error('Error en updateTolerancia:', error);
        res.status(500).json({
            success: false,
            message: 'Error al actualizar tolerancia'
        });
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
            UPDATE tolerancias SET es_activo = false WHERE id = $1 RETURNING id, nombre
        `, [id]);

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
