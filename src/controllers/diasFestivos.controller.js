import { pool } from '../config/db.js';
import { generateId, ID_PREFIXES } from '../utils/idGenerator.js';

/**
 * GET /api/dias-festivos
 * Obtiene todos los días festivos
 */
export async function getDiasFestivos(req, res) {
    try {
        const { year, tipo, es_activo } = req.query;

        let query = `
            SELECT
                id,
                nombre,
                fecha,
                es_obligatorio,
                tipo,
                pais,
                estado,
                descripcion,
                fecha_registro,
                es_activo
            FROM dias_festivos
            WHERE 1=1
        `;
        const params = [];
        let paramIndex = 1;

        if (year) {
            query += ` AND EXTRACT(YEAR FROM fecha) = $${paramIndex++}`;
            params.push(parseInt(year));
        }

        if (tipo) {
            query += ` AND tipo = $${paramIndex++}`;
            params.push(tipo);
        }

        if (es_activo !== undefined) {
            query += ` AND es_activo = $${paramIndex++}`;
            params.push(es_activo === 'true');
        } else {
            query += ` AND es_activo = true`;
        }

        query += ` ORDER BY fecha ASC`;

        const resultado = await pool.query(query, params);

        res.json({
            success: true,
            data: resultado.rows
        });

    } catch (error) {
        console.error('Error en getDiasFestivos:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener días festivos'
        });
    }
}

/**
 * POST /api/dias-festivos/sincronizar
 * Sincroniza días festivos desde la API de Nager.Date
 */
export async function sincronizarDiasFestivos(req, res) {
    try {
        const { year } = req.body;
        const currentYear = year || new Date().getFullYear();

        // Llamar a la API de Nager.Date (gratis, sin API key)
        const response = await fetch(
            `https://date.nager.at/api/v3/PublicHolidays/${currentYear}/MX`
        );

        if (!response.ok) {
            throw new Error('Error al obtener datos de la API');
        }

        const holidays = await response.json();
        let insertados = 0;
        let actualizados = 0;

        for (const holiday of holidays) {
            // Verificar si ya existe
            const existe = await pool.query(
                'SELECT id FROM dias_festivos WHERE fecha = $1',
                [holiday.date]
            );

            if (existe.rows.length > 0) {
                // Actualizar
                await pool.query(`
                    UPDATE dias_festivos SET
                        nombre = $1,
                        tipo = 'oficial',
                        pais = 'MEX',
                        es_activo = true
                    WHERE fecha = $2
                `, [holiday.localName || holiday.name, holiday.date]);
                actualizados++;
            } else {
                // Insertar nuevo
                const id = await generateId(ID_PREFIXES.DIA_FESTIVO);
                await pool.query(`
                    INSERT INTO dias_festivos (
                        id, nombre, fecha, es_obligatorio, tipo, pais
                    ) VALUES ($1, $2, $3, $4, 'oficial', 'MEX')
                `, [
                    id,
                    holiday.localName || holiday.name,
                    holiday.date,
                    holiday.global !== false // Si es global, es obligatorio
                ]);
                insertados++;
            }
        }

        res.json({
            success: true,
            message: `Sincronización completada: ${insertados} insertados, ${actualizados} actualizados`,
            data: {
                year: currentYear,
                total: holidays.length,
                insertados,
                actualizados
            }
        });

    } catch (error) {
        console.error('Error en sincronizarDiasFestivos:', error);
        res.status(500).json({
            success: false,
            message: 'Error al sincronizar días festivos',
            error: error.message
        });
    }
}

/**
 * POST /api/dias-festivos
 * Crea un día festivo personalizado
 */
export async function createDiaFestivo(req, res) {
    try {
        const {
            nombre,
            fecha,
            es_obligatorio = true,
            tipo = 'empresa',
            estado,
            descripcion
        } = req.body;

        if (!nombre || !fecha) {
            return res.status(400).json({
                success: false,
                message: 'nombre y fecha son requeridos'
            });
        }

        // Verificar si ya existe
        const existe = await pool.query(
            'SELECT id FROM dias_festivos WHERE fecha = $1',
            [fecha]
        );

        if (existe.rows.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'Ya existe un día festivo en esta fecha'
            });
        }

        const id = await generateId(ID_PREFIXES.DIA_FESTIVO);

        const resultado = await pool.query(`
            INSERT INTO dias_festivos (
                id, nombre, fecha, es_obligatorio, tipo, estado, descripcion
            ) VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING *
        `, [id, nombre, fecha, es_obligatorio, tipo, estado || null, descripcion || null]);

        res.status(201).json({
            success: true,
            message: 'Día festivo creado correctamente',
            data: resultado.rows[0]
        });

    } catch (error) {
        console.error('Error en createDiaFestivo:', error);
        res.status(500).json({
            success: false,
            message: 'Error al crear día festivo'
        });
    }
}

/**
 * PUT /api/dias-festivos/:id
 * Actualiza un día festivo
 */
export async function updateDiaFestivo(req, res) {
    try {
        const { id } = req.params;
        const {
            nombre,
            fecha,
            es_obligatorio,
            tipo,
            estado,
            descripcion
        } = req.body;

        const resultado = await pool.query(`
            UPDATE dias_festivos SET
                nombre = COALESCE($1, nombre),
                fecha = COALESCE($2, fecha),
                es_obligatorio = COALESCE($3, es_obligatorio),
                tipo = COALESCE($4, tipo),
                estado = COALESCE($5, estado),
                descripcion = COALESCE($6, descripcion)
            WHERE id = $7
            RETURNING *
        `, [nombre, fecha, es_obligatorio, tipo, estado, descripcion, id]);

        if (resultado.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Día festivo no encontrado'
            });
        }

        res.json({
            success: true,
            message: 'Día festivo actualizado correctamente',
            data: resultado.rows[0]
        });

    } catch (error) {
        console.error('Error en updateDiaFestivo:', error);
        res.status(500).json({
            success: false,
            message: 'Error al actualizar día festivo'
        });
    }
}

/**
 * DELETE /api/dias-festivos/:id
 * Desactiva un día festivo (soft delete)
 */
export async function deleteDiaFestivo(req, res) {
    try {
        const { id } = req.params;

        const resultado = await pool.query(`
            UPDATE dias_festivos SET es_activo = false
            WHERE id = $1
            RETURNING id, nombre
        `, [id]);

        if (resultado.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Día festivo no encontrado'
            });
        }

        res.json({
            success: true,
            message: 'Día festivo desactivado correctamente'
        });

    } catch (error) {
        console.error('Error en deleteDiaFestivo:', error);
        res.status(500).json({
            success: false,
            message: 'Error al desactivar día festivo'
        });
    }
}
