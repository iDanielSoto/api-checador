import { pool } from '../config/db.js';
import { generateId, generateSecurityKey, generateCompanyIdentifier, ID_PREFIXES } from '../utils/idGenerator.js';
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
                e.identificador,
                e.logo,
                e.telefono,
                e.correo,
                e.es_activo,
                e.fecha_registro,
                e.configuracion_id,
                c.idioma,
                c.zona_horaria,
                (SELECT COUNT(*) FROM departamentos d WHERE d.empresa_id = e.id AND d.es_activo = true) as total_departamentos,
                (SELECT COUNT(*) FROM usuarios u WHERE u.empresa_id = e.id AND u.estado_cuenta = 'activo') as total_usuarios
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
 * GET /api/empresas/mi-empresa
 * Devuelve los datos de la empresa del usuario autenticado (disponible para Tenant Admins)
 */
export async function getMiEmpresa(req, res) {
    try {
        const resultado = await pool.query(`
            SELECT
                e.id, e.nombre, e.identificador, e.logo, e.telefono, e.correo, e.es_activo, e.fecha_registro,
                e.configuracion_id,
                c.idioma, c.zona_horaria, c.formato_fecha, c.formato_hora, c.segmentos_red,
                (SELECT COUNT(*) FROM departamentos d WHERE d.empresa_id = e.id AND d.es_activo = true) as total_departamentos,
                (SELECT COUNT(*) FROM usuarios u WHERE u.empresa_id = e.id AND u.estado_cuenta = 'activo') as total_usuarios
            FROM empresas e
            LEFT JOIN configuraciones c ON c.id = e.configuracion_id
            WHERE e.id = $1
        `, [req.empresa_id]);

        if (resultado.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Empresa no encontrada' });
        }

        res.json({ success: true, data: resultado.rows[0] });

    } catch (error) {
        console.error('Error en getMiEmpresa:', error);
        res.status(500).json({ success: false, message: 'Error al obtener datos de la empresa' });
    }
}

/**
 * PUT /api/empresas/mi-empresa
 * Permite al Tenant Admin actualizar su propia empresa (sin necesitar ser SaaS Owner)
 */
export async function updateMiEmpresa(req, res) {
    try {
        const { nombre, logo, telefono, correo } = req.body;

        if (!nombre?.trim()) {
            return res.status(400).json({ success: false, message: 'El nombre de la empresa es requerido' });
        }

        const resultado = await pool.query(`
            UPDATE empresas SET
                nombre = $1,
                logo = $2,
                telefono = $3,
                correo = $4
            WHERE id = $5
            RETURNING id, nombre, logo, telefono, correo, es_activo
        `, [nombre.trim(), logo || null, telefono || null, correo || null, req.empresa_id]);

        if (resultado.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Empresa no encontrada' });
        }

        res.json({ success: true, data: resultado.rows[0], message: 'Empresa actualizada correctamente' });

    } catch (error) {
        console.error('Error en updateMiEmpresa:', error);
        res.status(500).json({ success: false, message: 'Error al actualizar la empresa' });
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
 * Aprovisionamiento Completo SaaS: Crea una nueva empresa y a su primer Administrador
 */
export async function createEmpresa(req, res) {
    const client = await pool.connect();

    try {
        const {
            nombre,
            logo,
            telefono,
            correo,
            admin_usuario, // Creado especialmente para el SaaS frontend
            admin_correo,
            // Configuración inicial
            idioma = 'es',
            formato_fecha = 'DD/MM/YYYY',
            formato_hora = '24',
            zona_horaria = 'America/Mexico_City',
            // Límites y Licencias
            limite_empleados = null,
            limite_dispositivos = null,
            fecha_vencimiento = null
        } = req.body;

        if (!nombre || !admin_usuario || !admin_correo) {
            return res.status(400).json({
                success: false,
                message: 'Faltan campos obligatorios para el aprovisionamiento (Nombre Empresa, Usuario Admin, Correo Admin)'
            });
        }

        // NOTA: El constraint de BD (usuario, empresa_id) y (correo, empresa_id)
        // garantiza unicidad por empresa. No se valida globalmente porque el mismo
        // usuario/correo puede existir en empresas distintas (multi-tenant).

        await client.query('BEGIN');

        // 2. Crear configuración de Tenant
        const configId = await generateId(ID_PREFIXES.CONFIGURACION);
        await client.query(`
            INSERT INTO configuraciones (id, idioma, formato_fecha, formato_hora, zona_horaria)
            VALUES ($1, $2, $3, $4, $5)
        `, [configId, idioma, formato_fecha, formato_hora, zona_horaria]);

        // 3. Crear empresa pública
        const empresaId = await generateId(ID_PREFIXES.EMPRESA);
        const identificador = generateCompanyIdentifier(nombre);

        const resultadoEmpresa = await client.query(`
            INSERT INTO empresas (
                id, nombre, logo, telefono, correo, es_activo, configuracion_id, 
                limite_empleados, limite_dispositivos, fecha_vencimiento, identificador
            )
            VALUES ($1, $2, $3, $4, $5, true, $6, $7, $8, $9, $10)
            RETURNING *
        `, [
            empresaId, nombre, logo, telefono, correo, configId,
            limite_empleados, limite_dispositivos, fecha_vencimiento, identificador
        ]);

        // 4. Crear Credenciales del Primer Administrador de esta empresa
        const usuarioId = await generateId(ID_PREFIXES.USUARIO);
        const clave_seguridad = generateSecurityKey();

        const bcrypt = await import('bcrypt');
        const defaultPassword = '12345678'; // Contraseña temporal por defecto
        const hashedPassword = await bcrypt.hash(defaultPassword, 10);

        await client.query(`
            INSERT INTO usuarios (
                id, usuario, contraseña, correo, nombre, estado_cuenta, empresa_id, es_empleado, clave_seguridad
            )
            VALUES ($1, $2, $3, $4, $5, 'activo', $6, false, $7)
        `, [
            usuarioId,
            admin_usuario,
            hashedPassword,
            admin_correo,
            'Administrador Principal',
            empresaId,
            clave_seguridad
        ]);

        // 5. Crear roles base propios para la nueva empresa (aislamiento total de Tenant)
        const rolesBase = [
            { nombre: 'Empleado', posicion: 1, es_admin: false, es_empleado: true, permisos: '0' },
            { nombre: 'Administrador', posicion: 0, es_admin: true, es_empleado: false, permisos: '9223372036854775807' },
        ];

        let rolAdminId = null;
        for (const rolDef of rolesBase) {
            const rolId = await generateId(ID_PREFIXES.ROL);
            await client.query(`
                INSERT INTO roles (id, nombre, posicion, es_admin, es_empleado, permisos_bitwise, empresa_id, es_activo)
                VALUES ($1, $2, $3, $4, $5, $6, $7, true)
            `, [rolId, rolDef.nombre, rolDef.posicion, rolDef.es_admin, rolDef.es_empleado, rolDef.permisos, empresaId]);
            if (rolDef.es_admin) rolAdminId = rolId;
        }

        // 6. Asignar rol Administrador al nuevo usuario (rol de ESTA empresa)
        if (rolAdminId) {
            const urlId = await generateId(ID_PREFIXES.USUARIO_ROL);
            await client.query(`
                INSERT INTO usuarios_roles (id, usuario_id, rol_id, es_activo)
                VALUES ($1, $2, $3, true)
            `, [urlId, usuarioId, rolAdminId]);
        }


        await client.query('COMMIT');

        // Enviar respuesta exitosa con la password en texto plano (una sola vez)
        res.status(201).json({
            success: true,
            message: 'Tenant aprovisionado exitosamente',
            data: {
                empresa: resultadoEmpresa.rows[0],
                admin: {
                    usuario: admin_usuario,
                    correo: admin_correo,
                    password_temporal: defaultPassword
                }
            }
        });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error en createEmpresa (Aprovisionamiento SaaS):', error);
        res.status(500).json({
            success: false,
            message: 'Error al aprovisionar la nueva empresa',
            error: error.message
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
        const {
            nombre, logo, es_activo, telefono, correo,
            limite_empleados, limite_dispositivos, fecha_vencimiento
        } = req.body;

        const resultado = await pool.query(`
            UPDATE empresas SET
                nombre   = COALESCE($1, nombre),
                logo     = COALESCE($2, logo),
                es_activo= COALESCE($3, es_activo),
                telefono = COALESCE($4, telefono),
                correo   = COALESCE($5, correo),
                limite_empleados = CASE WHEN $6::text = 'null' THEN NULL ELSE COALESCE($6::integer, limite_empleados) END,
                limite_dispositivos = CASE WHEN $7::text = 'null' THEN NULL ELSE COALESCE($7::integer, limite_dispositivos) END,
                fecha_vencimiento = CASE WHEN $8::text = 'null' THEN NULL ELSE COALESCE($8::timestamp, fecha_vencimiento) END
            WHERE id = $9
            RETURNING *
        `, [nombre, logo, es_activo, telefono, correo, limite_empleados, limite_dispositivos, fecha_vencimiento, id]);

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
                e.id, e.nombre, e.identificador, e.logo, e.es_activo,
                c.idioma, c.zona_horaria, c.formato_fecha, c.formato_hora
            FROM empresas e
            LEFT JOIN configuraciones c ON c.id = e.configuracion_id
            WHERE e.id = $1 AND e.es_activo = true
        `, [id]);

        if (resultado.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Empresa no encontrada' });
        }

        res.json({ success: true, data: resultado.rows[0] });
    } catch (error) {
        console.error('Error en getEmpresaPublicaById:', error);
        res.status(500).json({ success: false, message: 'Error interno' });
    }
}

/**
 * GET /api/empresas/identificador/:slug
 * Obtiene información básica de una empresa por su identificador (público)
 */
export async function getEmpresaPublicaByIdentificador(req, res) {
    try {
        const { slug } = req.params;

        const resultado = await pool.query(`
            SELECT
                e.id, e.nombre, e.identificador, e.logo, e.es_activo,
                c.idioma, c.zona_horaria, c.formato_fecha, c.formato_hora
            FROM empresas e
            LEFT JOIN configuraciones c ON c.id = e.configuracion_id
            WHERE e.identificador = $1 AND e.es_activo = true
        `, [slug]);

        if (resultado.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Empresa no encontrada por identificador' });
        }

        res.json({ success: true, data: resultado.rows[0] });
    } catch (error) {
        console.error('Error en getEmpresaPublicaByIdentificador:', error);
        res.status(500).json({ success: false, message: 'Error interno' });
    }
}
