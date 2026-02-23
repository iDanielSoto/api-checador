import { pool } from '../config/db.js';
import { requestContext } from '../utils/context.js';

/**
 * Middleware para gestionar el Aislamiento de Múltiples Empresas (Multi-Tenant)
 * Identifica a qué empresa pertenece la solicitud basándose en el usuario autenticado
 * o en el requerimiento específico de un SuperAdministrador.
 */
export async function verificarEmpresa(req, res, next) {
    try {
        if (!req.usuario) {
            return res.status(401).json({
                success: false,
                message: 'No autenticado. Se requiere verificar la sesión primero.'
            });
        }

        let empresa_id = null;

        // 1. Si el usuario es Super Admin (y eventualmente quiere cambiar de contexto)
        // puede enviar un header 'X-Empresa-Id'
        if (req.usuario.esAdmin) {
            const empresaHeader = req.headers['x-empresa-id'];
            if (empresaHeader) {
                // Opcional: Validar que el empresaHeader existe en la tabla empresas
                const empresaExistente = await pool.query('SELECT id FROM empresas WHERE id = $1', [empresaHeader]);
                if (empresaExistente.rows.length === 0) {
                    return res.status(404).json({
                        success: false,
                        message: 'La empresa solicitada no existe o no se tiene acceso.'
                    });
                }
                empresa_id = empresaHeader;
            } else {
                // Si es admin pero no manda header, usa su empresa por defecto.
                empresa_id = req.usuario.empresa_id;
            }
        } else {
            // 2. Usuarios regulares SIEMPRE usan la empresa vinculada a su cuenta
            empresa_id = req.usuario.empresa_id;
        }

        if (!empresa_id) {
            return res.status(403).json({
                success: false,
                message: 'El usuario no tiene una empresa asignada. Por favor, contacte a soporte.'
            });
        }

        // Inyectar el empresa_id en la solicitud para que los controladores lo utilicen
        req.empresa_id = empresa_id;

        // Obtener el prefijo de la empresa si existe (o default a FAS si es admin global, etc.)
        const resPref = await pool.query('SELECT prefijo FROM empresas WHERE id = $1', [empresa_id]);
        let pfx = 'SYS';
        if (resPref.rows.length > 0 && resPref.rows[0].prefijo) {
            pfx = resPref.rows[0].prefijo;
        }

        const store = requestContext.getStore();
        if (store) {
            store.set('empresa_id', empresa_id);
            store.set('empresa_prefijo', pfx);
        }

        next();
    } catch (error) {
        console.error('Error en middleware verificarEmpresa:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno al verificar la jurisdicción de la empresa.'
        });
    }
}

/**
 * Middleware para identificar a los Dueños de la Plataforma (SaaS Owners).
 * Solo ellos pueden acceder a endpoints donde se gestionan o ven todas las empresas.
 */
export async function requireSaaSOwner(req, res, next) {
    try {
        if (!req.usuario) {
            return res.status(401).json({
                success: false,
                message: 'No autenticado. Se requiere verificar la sesión.'
            });
        }

        // Si el middleware de autenticación base ya lo validó, simplemente lo dejamos pasar
        if (req.usuario && req.usuario.esPropietarioSaaS) {
            return next();
        }

        // Validación secundaria directa a BD para mayor seguridad
        const resultado = await pool.query(`
            SELECT id FROM super_administradores WHERE id = $1 AND estado_cuenta = 'activo'
        `, [req.usuario.id]);

        if (resultado.rows.length === 0) {
            return res.status(403).json({
                success: false,
                message: 'Acceso Denegado: Esta zona está restringida a los Propietarios del Sistema (SaaS).'
            });
        }

        // Si es dueño del sistema, pasamos al controlador
        req.usuario.esPropietarioSaaS = true;
        next();
    } catch (error) {
        console.error('Error en middleware requireSaaSOwner:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno al verificar permisos de Propietario SaaS.'
        });
    }
}
