import { pool } from '../config/db.js';
import { generateId, ID_PREFIXES } from '../utils/idGenerator.js';
import { broadcast } from '../utils/sse.js';

/**
 * GET /api/empresas
 * Obtiene todas las empresas
 */
export async function getEmpresas(req, res) {
    try {
        const { es_activo } = req.query;

        let query = `
            SELECT
                e.id,
                e.nombre,
                e.logo,
                e.telefono,
                e.correo,
                e.es_activo,
                e.fecha_registro,
                e.configuracion_id,
                c.idioma,
                c.zona_horaria
            FROM empresas e
            LEFT JOIN configuraciones c ON c.id = e.configuracion_id
            WHERE 1=1
        `;

        const params = [];

        if (es_activo !== undefined) {
            query += ` AND e.es_activo = $1`;
            params.push(es_activo === 'true');
        }

        query += ` ORDER BY e.nombre ASC`;

        const resultado = await pool.query(query, params);

        res.json({
            success: true,
            data: resultado.rows
        });

    } catch (error) {
        console.error('Error en getEmpresas:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener empresas'
        });
    }
}

/**
 * GET /api/empresas/:id
 * Obtiene una empresa por ID
 */
export async function getEmpresaById(req, res) {
    try {
        const { id } = req.params;

        const resultado = await pool.query(`
            SELECT
                e.*,
                c.*,
                e.id as id,
                e.nombre as nombre
            FROM empresas e
            LEFT JOIN configuraciones c ON c.id = e.configuracion_id
            WHERE e.id = $1
        `, [id]);

        if (resultado.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Empresa no encontrada'
            });
        }

        res.json({
            success: true,
            data: resultado.rows[0]
        });

    } catch (error) {
        console.error('Error en getEmpresaById:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener empresa'
        });
    }
}

/**
 * POST /api/empresas
 * Crea una nueva empresa con su configuración
 */
export async function createEmpresa(req, res) {
    const client = await pool.connect();

    try {
        const {
            nombre,
            logo,
            telefono,
            correo,
            // Configuración inicial
            idioma = 'es',
            formato_fecha = 'DD/MM/YYYY',
            formato_hora = '24',
            zona_horaria = 'America/Mexico_City'
        } = req.body;

        if (!nombre) {
            return res.status(400).json({
                success: false,
                message: 'El nombre es requerido'
            });
        }

        await client.query('BEGIN');

        // Crear configuración
        const configId = await generateId(ID_PREFIXES.CONFIGURACION);
        await client.query(`
            INSERT INTO configuraciones (id, idioma, formato_fecha, formato_hora, zona_horaria)
            VALUES ($1, $2, $3, $4, $5)
        `, [configId, idioma, formato_fecha, formato_hora, zona_horaria]);

        // Crear empresa
        const empresaId = await generateId(ID_PREFIXES.EMPRESA);
        const resultado = await client.query(`
            INSERT INTO empresas (
                id, nombre, logo, telefono, correo, es_activo, configuracion_id
            )
            VALUES ($1, $2, $3, $4, $5, true, $6)
            RETURNING *
        `, [empresaId, nombre, logo, telefono, correo, configId]);

        await client.query('COMMIT');

        res.status(201).json({
            success: true,
            message: 'Empresa creada correctamente',
            data: resultado.rows[0]
        });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error en createEmpresa:', error);
        res.status(500).json({
            success: false,
            message: 'Error al crear empresa'
        });
    } finally {
        client.release();
    }
}

/**
 * PUT /api/empresas/:id    
 * Actualiza una empresa
 */
export async function updateEmpresa(req, res) {
    try {
        const { id } = req.params;
        const { nombre, logo, es_activo, telefono, correo } = req.body;

        const resultado = await pool.query(`
            UPDATE empresas SET
                nombre   = COALESCE($1, nombre),
                logo     = COALESCE($2, logo),
                es_activo= COALESCE($3, es_activo),
                telefono = COALESCE($4, telefono),
                correo   = COALESCE($5, correo)
            WHERE id = $6
            RETURNING *
        `, [nombre, logo, es_activo, telefono, correo, id]);

        if (resultado.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Empresa no encontrada'
            });
        }

        // Notificar via SSE
        broadcast('empresa-actualizada', resultado.rows[0]);

        res.json({
            success: true,
            message: 'Empresa actualizada correctamente',
            data: resultado.rows[0]
        });

    } catch (error) {
        console.error('Error en updateEmpresa:', error);
        res.status(500).json({
            success: false,
            message: 'Error al actualizar empresa'
        });
    }
}

/**
 * DELETE /api/empresas/:id
 * Desactiva una empresa
 */
export async function deleteEmpresa(req, res) {
    try {
        const { id } = req.params;

        const resultado = await pool.query(`
            UPDATE empresas SET es_activo = false
            WHERE id = $1 AND es_activo = true
            RETURNING id
        `, [id]);

        if (resultado.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Empresa no encontrada o ya desactivada'
            });
        }

        res.json({
            success: true,
            message: 'Empresa desactivada correctamente'
        });

    } catch (error) {
        console.error('Error en deleteEmpresa:', error);
        res.status(500).json({
            success: false,
            message: 'Error al desactivar empresa'
        });
    }
}

/**
 * GET /api/empresas/public/:id
 * Obtiene información básica de una empresa por ID (público)
 */
export async function getEmpresaPublicaById(req, res) {
    try {
        const { id } = req.params;

        const resultado = await pool.query(`
            SELECT
                e.id,
                e.nombre,
                e.logo,
                e.es_activo,
                c.idioma,
                c.zona_horaria,
                c.formato_fecha,
                c.formato_hora
            FROM empresas e
            LEFT JOIN configuraciones c ON c.id = e.configuracion_id
            WHERE e.id = $1 AND e.es_activo = true
        `, [id]);

        if (resultado.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Empresa no encontrada'
            });
        }

        res.json({
            success: true,
            data: resultado.rows[0]
        });

    } catch (error) {
        console.error('Error en getEmpresaPublicaById:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener información de la empresa'
        });
    }
}
