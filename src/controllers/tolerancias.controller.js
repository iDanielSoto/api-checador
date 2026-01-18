import { pool } from '../config/db.js';
import { generateId, ID_PREFIXES } from '../utils/idGenerator.js';

/**
 * GET /api/tolerancias
 * Obtiene todas las tolerancias
 */
export async function getTolerancias(req, res) {
    try {
        const resultado = await pool.query(`
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
                (SELECT COUNT(*) FROM roles r WHERE r.tolerancia_id = t.id) as roles_count
            FROM tolerancias t
            ORDER BY t.nombre ASC
        `);

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
            SELECT * FROM tolerancias WHERE id = $1
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
        const {
            nombre,
            minutos_retardo = 10,
            minutos_falta = 30,
            permite_registro_anticipado = true,
            minutos_anticipado_max = 60,
            aplica_tolerancia_entrada = true,
            aplica_tolerancia_salida = false,
            dias_aplica
        } = req.body;

        if (!nombre) {
            return res.status(400).json({
                success: false,
                message: 'El nombre es requerido'
            });
        }

        const id = await generateId(ID_PREFIXES.TOLERANCIA);

        const resultado = await pool.query(`
            INSERT INTO tolerancias (
                id, nombre, minutos_retardo, minutos_falta,
                permite_registro_anticipado, minutos_anticipado_max,
                aplica_tolerancia_entrada, aplica_tolerancia_salida, dias_aplica
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            RETURNING *
        `, [
            id, nombre, minutos_retardo, minutos_falta,
            permite_registro_anticipado, minutos_anticipado_max,
            aplica_tolerancia_entrada, aplica_tolerancia_salida,
            dias_aplica ? JSON.stringify(dias_aplica) : null
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
            dias_aplica
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
            WHERE id = $9
            RETURNING *
        `, [
            nombre, minutos_retardo, minutos_falta,
            permite_registro_anticipado, minutos_anticipado_max,
            aplica_tolerancia_entrada, aplica_tolerancia_salida,
            diasJson, id
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
 * Elimina una tolerancia
 */
export async function deleteTolerancia(req, res) {
    try {
        const { id } = req.params;

        // Verificar si tiene roles asignados
        const roles = await pool.query(
            'SELECT COUNT(*) FROM roles WHERE tolerancia_id = $1',
            [id]
        );

        if (parseInt(roles.rows[0].count) > 0) {
            return res.status(400).json({
                success: false,
                message: 'No se puede eliminar una tolerancia con roles asignados'
            });
        }

        const resultado = await pool.query(
            'DELETE FROM tolerancias WHERE id = $1 RETURNING id',
            [id]
        );

        if (resultado.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Tolerancia no encontrada'
            });
        }

        res.json({
            success: true,
            message: 'Tolerancia eliminada correctamente'
        });

    } catch (error) {
        console.error('Error en deleteTolerancia:', error);
        res.status(500).json({
            success: false,
            message: 'Error al eliminar tolerancia'
        });
    }
}
