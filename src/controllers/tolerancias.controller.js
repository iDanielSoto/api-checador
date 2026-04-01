import { pool } from '../config/db.js';
import { generateId, ID_PREFIXES } from '../utils/idGenerator.js';
import { validarReglasTolerancia } from '../utils/asistenciaClassifier.js';

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
                t.permite_registro_anticipado,
                t.minutos_anticipado_max,
                t.aplica_tolerancia_entrada,
                t.aplica_tolerancia_salida,
                t.minutos_anticipo_salida,
                t.minutos_posterior_salida,
                t.dias_aplica,
                t.fecha_registro,
                t.es_activo,
                t.reglas
            FROM tolerancias t
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
            SELECT t.*
            FROM tolerancias t
            WHERE t.id = $1 AND t.empresa_id = $2
        `, [id, req.empresa_id]);

        if (resultado.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Tolerancia no encontrada'
            });
        }

        res.json({
            success: true,
            data: resultado.rows[0]
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
            reglas = [],
            permite_registro_anticipado = true,
            minutos_anticipado_max = 60,
            aplica_tolerancia_entrada = true,
            aplica_tolerancia_salida = false,
            minutos_anticipo_salida,
            minutos_anticipado_salida,
            minutos_anticipo,
            minutos_posterior_salida = 60,
            dias_aplica,
            rol_id
        } = req.body;

        const anticipoSalidaFinal = minutos_anticipo_salida ?? minutos_anticipado_salida ?? minutos_anticipo ?? 0;

        // Si no se envía nombre pero sí rol_id, tomar el nombre del rol
        if (!nombre && rol_id) {
            const rol = await client.query('SELECT nombre FROM roles WHERE id = $1', [rol_id]);
            if (rol.rows.length > 0) {
                nombre = `Tolerancia - ${rol.rows[0].nombre} `;
            }
        }

        if (!nombre) {
            client.release();
            return res.status(400).json({
                success: false,
                message: 'El nombre es requerido (o proporciona un rol_id para generar uno automático)'
            });
        }

        if (reglas && Array.isArray(reglas)) {
            const validacion = validarReglasTolerancia(reglas);
            if (!validacion.valido) {
                client.release();
                return res.status(400).json({
                    success: false,
                    message: validacion.mensaje
                });
            }
        }

        await client.query('BEGIN');

        const id = await generateId(ID_PREFIXES.TOLERANCIA);

        // 1. Insertar tolerancia
        const resultado = await client.query(`
            INSERT INTO tolerancias(
                id, nombre, reglas,
                permite_registro_anticipado, minutos_anticipado_max,
                aplica_tolerancia_entrada, aplica_tolerancia_salida, 
                minutos_anticipo_salida, minutos_posterior_salida,
                dias_aplica, empresa_id
            )
        VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING *
            `, [
            id, nombre, JSON.stringify(reglas),
            permite_registro_anticipado, minutos_anticipado_max,
            aplica_tolerancia_entrada, aplica_tolerancia_salida,
            anticipoSalidaFinal, minutos_posterior_salida,
            dias_aplica ? JSON.stringify(dias_aplica) : null,
            req.empresa_id
        ]);

        await client.query('COMMIT');

        res.status(201).json({
            success: true,
            message: 'Tolerancia creada correctamente',
            data: resultado.rows[0]
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
            reglas,
            permite_registro_anticipado,
            minutos_anticipado_max,
            aplica_tolerancia_entrada,
            aplica_tolerancia_salida,
            minutos_anticipo_salida,
            minutos_anticipado_salida,
            minutos_anticipo,
            minutos_posterior_salida,
            dias_aplica,
            rol_id
        } = req.body;

        const anticipoSalidaFinal = minutos_anticipo_salida ?? minutos_anticipado_salida ?? minutos_anticipo;
        const diasJson = dias_aplica ? JSON.stringify(dias_aplica) : null;

        if (reglas && Array.isArray(reglas)) {
            const validacion = validarReglasTolerancia(reglas);
            if (!validacion.valido) {
                client.release();
                return res.status(400).json({
                    success: false,
                    message: validacion.mensaje
                });
            }
        }

        await client.query('BEGIN');

        // 1. Actualizar tolerancia
        const resultado = await client.query(`
            UPDATE tolerancias SET
                nombre = $1,
                reglas = $2,
                permite_registro_anticipado = $3,
                minutos_anticipado_max = $4,
                aplica_tolerancia_entrada = $5,
                aplica_tolerancia_salida = $6,
                minutos_anticipo_salida = $7,
                minutos_posterior_salida = $8,
                dias_aplica = $9
            WHERE id = $10 AND empresa_id = $11
            RETURNING *
        `, [
            nombre,
            reglas ? JSON.stringify(reglas) : '[]',
            permite_registro_anticipado ?? true,
            minutos_anticipado_max ?? 0,
            aplica_tolerancia_entrada ?? true,
            aplica_tolerancia_salida ?? false,
            anticipoSalidaFinal ?? 0,
            minutos_posterior_salida ?? 0,
            diasJson || '{}',
            id,
            req.empresa_id
        ]);

        if (resultado.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({
                success: false,
                message: 'Tolerancia no encontrada'
            });
        }

        await client.query('COMMIT');

        res.json({
            success: true,
            message: 'Tolerancia actualizada correctamente',
            data: resultado.rows[0]
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
