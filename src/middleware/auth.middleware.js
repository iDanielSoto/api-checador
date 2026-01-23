/**
 * Middleware de Autenticación
 * Verifica que el usuario esté autenticado antes de acceder a rutas protegidas
 */

import { pool } from '../config/db.js';

/**
 * Verifica que exista un usuario autenticado en la sesión
 * Espera que el token/session ID venga en el header Authorization
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export async function verificarAutenticacion(req, res, next) {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader) {
            return res.status(401).json({
                success: false,
                message: 'No se proporcionó token de autenticación'
            });
        }

        // Formato esperado: "Bearer <usuario_id>" o "Bearer <token>"
        const [bearer, token] = authHeader.split(' ');

        if (bearer !== 'Bearer' || !token) {
            return res.status(401).json({
                success: false,
                message: 'Formato de autenticación inválido'
            });
        }

        // Buscar usuario por ID
        const resultado = await pool.query(`
            SELECT
                u.id,
                u.usuario,
                u.correo,
                u.nombre,
                u.foto,
                u.estado_cuenta,
                u.es_empleado,
                e.id as empleado_id
            FROM usuarios u
            LEFT JOIN empleados e ON e.usuario_id = u.id
            WHERE u.id = $1 AND u.estado_cuenta = 'activo'
        `, [token]);

        if (resultado.rows.length === 0) {
            return res.status(401).json({
                success: false,
                message: 'Sesión inválida o usuario no encontrado'
            });
        }

        // Obtener roles del usuario con sus permisos
        const rolesResult = await pool.query(`
            SELECT
                r.id,
                r.nombre,
                r.permisos_bitwise,
                r.es_admin,
                r.es_empleado,
                r.posicion
            FROM roles r
            INNER JOIN usuarios_roles ur ON ur.rol_id = r.id
            WHERE ur.usuario_id = $1 AND ur.es_activo = true
            ORDER BY r.posicion DESC
        `, [token]);

        // Combinar permisos de todos los roles
        let permisosCombinadosBigInt = BigInt(0);
        let esAdmin = false;

        for (const rol of rolesResult.rows) {
            if (rol.permisos_bitwise) {
                permisosCombinadosBigInt |= BigInt(rol.permisos_bitwise);
            }
            if (rol.es_admin) {
                esAdmin = true;
            }
        }

        // Adjuntar información del usuario al request
        req.usuario = {
            ...resultado.rows[0],
            roles: rolesResult.rows,
            permisos: permisosCombinadosBigInt.toString(),
            permisosBigInt: permisosCombinadosBigInt,
            esAdmin
        };

        next();
    } catch (error) {
        console.error('Error en verificarAutenticacion:', error);
        return res.status(500).json({
            success: false,
            message: 'Error interno de autenticación'
        });
    }
}

/**
 * Middleware opcional - No bloquea si no hay autenticación
 * Útil para rutas que funcionan diferente con/sin usuario
 */
export async function autenticacionOpcional(req, res, next) {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader) {
            req.usuario = null;
            return next();
        }

        const [bearer, token] = authHeader.split(' ');

        if (bearer !== 'Bearer' || !token) {
            req.usuario = null;
            return next();
        }

        const resultado = await pool.query(`
            SELECT
                u.id,
                u.usuario,
                u.correo,
                u.nombre,
                u.estado_cuenta,
                u.es_empleado,
                e.id as empleado_id
            FROM usuarios u
            LEFT JOIN empleados e ON e.usuario_id = u.id
            WHERE u.id = $1 AND u.estado_cuenta = 'activo'
        `, [token]);

        if (resultado.rows.length > 0) {
            const rolesResult = await pool.query(`
                SELECT r.id, r.nombre, r.permisos_bitwise, r.es_admin
                FROM roles r
                INNER JOIN usuarios_roles ur ON ur.rol_id = r.id
                WHERE ur.usuario_id = $1 AND ur.es_activo = true
            `, [token]);

            let permisosCombinadosBigInt = BigInt(0);
            for (const rol of rolesResult.rows) {
                if (rol.permisos_bitwise) {
                    permisosCombinadosBigInt |= BigInt(rol.permisos_bitwise);
                }
            }

            req.usuario = {
                ...resultado.rows[0],
                roles: rolesResult.rows,
                permisos: permisosCombinadosBigInt.toString(),
                permisosBigInt: permisosCombinadosBigInt
            };
        } else {
            req.usuario = null;
        }

        next();
    } catch (error) {
        console.error('Error en autenticacionOpcional:', error);
        req.usuario = null;
        next();
    }
}

/**
 * Verifica que el usuario sea empleado
 */
export function verificarEsEmpleado(req, res, next) {
    if (!req.usuario) {
        return res.status(401).json({
            success: false,
            message: 'No autenticado'
        });
    }

    if (!req.usuario.es_empleado || !req.usuario.empleado_id) {
        return res.status(403).json({
            success: false,
            message: 'Esta acción requiere ser empleado'
        });
    }

    next();
}

/**
 * Verifica que el usuario sea administrador
 */
export function verificarEsAdmin(req, res, next) {
    if (!req.usuario) {
        return res.status(401).json({
            success: false,
            message: 'No autenticado'
        });
    }

    if (!req.usuario.esAdmin) {
        return res.status(403).json({
            success: false,
            message: 'Esta acción requiere permisos de administrador'
        });
    }

    next();
}

/**
 * Verifica que la cuenta no esté suspendida o dada de baja
 */
export function verificarCuentaActiva(req, res, next) {
    if (!req.usuario) {
        return res.status(401).json({
            success: false,
            message: 'No autenticado'
        });
    }

    if (req.usuario.estado_cuenta !== 'activo') {
        return res.status(403).json({
            success: false,
            message: `Cuenta ${req.usuario.estado_cuenta}. Contacte al administrador.`
        });
    }

    next();
}