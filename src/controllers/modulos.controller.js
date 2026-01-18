import { pool } from '../config/db.js';

/**
 * GET /api/modulos
 * Obtiene todos los módulos activos
 */
export async function getModulos(req, res) {
    try {
        const resultado = await pool.query(`
            SELECT
                codigo,
                descripcion,
                icono,
                orden,
                es_activo,
                fecha_registro
            FROM modulos
            WHERE es_activo = true
            ORDER BY orden ASC
        `);

        // Mapear a formato esperado por el frontend
        const modulos = resultado.rows.map(m => ({
            id: m.codigo,
            codigo: m.codigo,
            nombre: m.descripcion,
            descripcion: m.descripcion,
            icono: m.icono,
            ruta: `/${m.codigo}`,
            orden: m.orden,
            es_activo: m.es_activo
        }));

        res.json({
            success: true,
            data: modulos
        });

    } catch (error) {
        console.error('Error en getModulos:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener módulos'
        });
    }
}

/**
 * GET /api/modulos/menu
 * Obtiene los módulos del menú filtrados por permisos del usuario
 */
export async function getModulosMenu(req, res) {
    try {
        const resultado = await pool.query(`
            SELECT
                codigo,
                descripcion,
                icono,
                orden
            FROM modulos
            WHERE es_activo = true
            ORDER BY orden ASC
        `);

        // Mapear a formato esperado por el frontend
        const modulos = resultado.rows.map(m => ({
            id: m.codigo,
            codigo: m.codigo,
            nombre: m.descripcion,
            icono: m.icono,
            ruta: m.codigo === 'home' ? '/' : `/${m.codigo}`,
            orden: m.orden
        }));

        // Si hay usuario autenticado, podemos filtrar por permisos
        // Por ahora devolvemos todos los activos
        res.json({
            success: true,
            data: modulos
        });

    } catch (error) {
        console.error('Error en getModulosMenu:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener menú de módulos'
        });
    }
}

/**
 * GET /api/modulos/:codigo
 * Obtiene un módulo por código
 */
export async function getModuloById(req, res) {
    try {
        const { id } = req.params;

        const resultado = await pool.query(`
            SELECT
                codigo,
                descripcion,
                icono,
                orden,
                es_activo,
                fecha_registro
            FROM modulos
            WHERE codigo = $1
        `, [id]);

        if (resultado.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Módulo no encontrado'
            });
        }

        const m = resultado.rows[0];
        res.json({
            success: true,
            data: {
                id: m.codigo,
                codigo: m.codigo,
                nombre: m.descripcion,
                descripcion: m.descripcion,
                icono: m.icono,
                ruta: `/${m.codigo}`,
                orden: m.orden,
                es_activo: m.es_activo,
                fecha_registro: m.fecha_registro
            }
        });

    } catch (error) {
        console.error('Error en getModuloById:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener módulo'
        });
    }
}

/**
 * POST /api/modulos
 * Crea un nuevo módulo
 */
export async function createModulo(req, res) {
    try {
        const {
            codigo,
            descripcion,
            icono,
            orden = 0,
            es_activo = true
        } = req.body;

        if (!codigo || !descripcion) {
            return res.status(400).json({
                success: false,
                message: 'Código y descripción son requeridos'
            });
        }

        // Verificar que el código no exista
        const existente = await pool.query(
            'SELECT codigo FROM modulos WHERE codigo = $1',
            [codigo]
        );

        if (existente.rows.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'Ya existe un módulo con ese código'
            });
        }

        const resultado = await pool.query(`
            INSERT INTO modulos (codigo, descripcion, icono, orden, es_activo)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING *
        `, [codigo, descripcion, icono, orden, es_activo]);

        const m = resultado.rows[0];
        res.status(201).json({
            success: true,
            message: 'Módulo creado correctamente',
            data: {
                id: m.codigo,
                codigo: m.codigo,
                nombre: m.descripcion,
                icono: m.icono,
                ruta: `/${m.codigo}`,
                orden: m.orden,
                es_activo: m.es_activo
            }
        });

    } catch (error) {
        console.error('Error en createModulo:', error);
        res.status(500).json({
            success: false,
            message: 'Error al crear módulo'
        });
    }
}

/**
 * PUT /api/modulos/:codigo
 * Actualiza un módulo existente
 */
export async function updateModulo(req, res) {
    try {
        const { id } = req.params;
        const {
            descripcion,
            icono,
            orden,
            es_activo
        } = req.body;

        const resultado = await pool.query(`
            UPDATE modulos SET
                descripcion = COALESCE($1, descripcion),
                icono = COALESCE($2, icono),
                orden = COALESCE($3, orden),
                es_activo = COALESCE($4, es_activo)
            WHERE codigo = $5
            RETURNING *
        `, [descripcion, icono, orden, es_activo, id]);

        if (resultado.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Módulo no encontrado'
            });
        }

        const m = resultado.rows[0];
        res.json({
            success: true,
            message: 'Módulo actualizado correctamente',
            data: {
                id: m.codigo,
                codigo: m.codigo,
                nombre: m.descripcion,
                icono: m.icono,
                ruta: `/${m.codigo}`,
                orden: m.orden,
                es_activo: m.es_activo
            }
        });

    } catch (error) {
        console.error('Error en updateModulo:', error);
        res.status(500).json({
            success: false,
            message: 'Error al actualizar módulo'
        });
    }
}

/**
 * DELETE /api/modulos/:codigo
 * Elimina un módulo (soft delete)
 */
export async function deleteModulo(req, res) {
    try {
        const { id } = req.params;

        const resultado = await pool.query(`
            UPDATE modulos SET es_activo = false WHERE codigo = $1 RETURNING codigo
        `, [id]);

        if (resultado.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Módulo no encontrado'
            });
        }

        res.json({
            success: true,
            message: 'Módulo eliminado correctamente'
        });

    } catch (error) {
        console.error('Error en deleteModulo:', error);
        res.status(500).json({
            success: false,
            message: 'Error al eliminar módulo'
        });
    }
}
