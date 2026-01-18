import bcrypt from 'bcrypt';
import { pool } from '../config/db.js';

/**
 * POST /api/auth/login
 * Inicia sesión con usuario/correo y contraseña
 */
export async function login(req, res) {
    try {
        const { usuario, contraseña } = req.body;

        if (!usuario || !contraseña) {
            return res.status(400).json({
                success: false,
                message: 'Usuario y contraseña son requeridos'
            });
        }

        // Buscar usuario por nombre de usuario o correo
        const resultado = await pool.query(`
            SELECT
                u.id,
                u.usuario,
                u.correo,
                u.contraseña,
                u.nombre,
                u.foto,
                u.telefono,
                u.estado_cuenta,
                u.es_empleado,
                e.id as empleado_id,
                e.rfc,
                e.nss
            FROM usuarios u
            LEFT JOIN empleados e ON e.usuario_id = u.id
            WHERE (u.usuario = $1 OR u.correo = $1)
        `, [usuario]);

        if (resultado.rows.length === 0) {
            return res.status(401).json({
                success: false,
                message: 'Credenciales inválidas'
            });
        }

        const usuarioData = resultado.rows[0];

        // Verificar estado de cuenta
        if (usuarioData.estado_cuenta !== 'activo') {
            return res.status(403).json({
                success: false,
                message: `Cuenta ${usuarioData.estado_cuenta}. Contacte al administrador.`
            });
        }

        // Verificar contraseña
        const contraseñaValida = await bcrypt.compare(contraseña, usuarioData.contraseña);

        if (!contraseñaValida) {
            return res.status(401).json({
                success: false,
                message: 'Credenciales inválidas'
            });
        }

        // Obtener roles del usuario
        const rolesResult = await pool.query(`
            SELECT
                r.id,
                r.nombre,
                r.descripcion,
                r.permisos_bitwise,
                r.es_admin,
                r.es_empleado,
                r.posicion
            FROM roles r
            INNER JOIN usuarios_roles ur ON ur.rol_id = r.id
            WHERE ur.usuario_id = $1 AND ur.es_activo = true
            ORDER BY r.posicion DESC
        `, [usuarioData.id]);

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

        // Eliminar contraseña de la respuesta
        delete usuarioData.contraseña;

        res.json({
            success: true,
            message: 'Inicio de sesión exitoso',
            data: {
                usuario: {
                    id: usuarioData.id,
                    usuario: usuarioData.usuario,
                    correo: usuarioData.correo,
                    nombre: usuarioData.nombre,
                    foto: usuarioData.foto,
                    telefono: usuarioData.telefono,
                    es_empleado: usuarioData.es_empleado,
                    empleado_id: usuarioData.empleado_id,
                    rfc: usuarioData.rfc,
                    nss: usuarioData.nss
                },
                roles: rolesResult.rows.map(r => ({
                    id: r.id,
                    nombre: r.nombre,
                    es_admin: r.es_admin,
                    posicion: r.posicion
                })),
                permisos: permisosCombinadosBigInt.toString(),
                esAdmin,
                // El token es el ID del usuario (simplificado)
                // En producción usar JWT
                token: usuarioData.id
            }
        });

    } catch (error) {
        console.error('Error en login:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor'
        });
    }
}

/**
 * POST /api/auth/logout
 * Cierra sesión (para futuro uso con tokens/sesiones)
 */
export async function logout(req, res) {
    try {
        // En un sistema con JWT/sesiones, aquí invalidarías el token
        // Por ahora solo confirmamos el logout
        res.json({
            success: true,
            message: 'Sesión cerrada correctamente'
        });
    } catch (error) {
        console.error('Error en logout:', error);
        res.status(500).json({
            success: false,
            message: 'Error al cerrar sesión'
        });
    }
}

/**
 * GET /api/auth/verificar
 * Verifica si la sesión actual es válida
 */
export async function verificarSesion(req, res) {
    try {
        // req.usuario viene del middleware de autenticación
        if (!req.usuario) {
            return res.status(401).json({
                success: false,
                message: 'Sesión no válida'
            });
        }

        res.json({
            success: true,
            data: {
                usuario: {
                    id: req.usuario.id,
                    usuario: req.usuario.usuario,
                    correo: req.usuario.correo,
                    nombre: req.usuario.nombre,
                    foto: req.usuario.foto,
                    es_empleado: req.usuario.es_empleado,
                    empleado_id: req.usuario.empleado_id
                },
                roles: req.usuario.roles,
                permisos: req.usuario.permisos,
                esAdmin: req.usuario.esAdmin
            }
        });
    } catch (error) {
        console.error('Error en verificarSesion:', error);
        res.status(500).json({
            success: false,
            message: 'Error al verificar sesión'
        });
    }
}

/**
 * POST /api/auth/cambiar-password
 * Cambia la contraseña del usuario autenticado
 */
export async function cambiarPassword(req, res) {
    try {
        const { contraseña_actual, contraseña_nueva } = req.body;

        if (!contraseña_actual || !contraseña_nueva) {
            return res.status(400).json({
                success: false,
                message: 'Contraseña actual y nueva son requeridas'
            });
        }

        if (contraseña_nueva.length < 6) {
            return res.status(400).json({
                success: false,
                message: 'La contraseña debe tener al menos 6 caracteres'
            });
        }

        // Obtener contraseña actual del usuario
        const resultado = await pool.query(
            'SELECT contraseña FROM usuarios WHERE id = $1',
            [req.usuario.id]
        );

        if (resultado.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Usuario no encontrado'
            });
        }

        // Verificar contraseña actual
        const contraseñaValida = await bcrypt.compare(
            contraseña_actual,
            resultado.rows[0].contraseña
        );

        if (!contraseñaValida) {
            return res.status(401).json({
                success: false,
                message: 'Contraseña actual incorrecta'
            });
        }

        // Hash de la nueva contraseña
        const hashNueva = await bcrypt.hash(contraseña_nueva, 10);

        // Actualizar contraseña
        await pool.query(
            'UPDATE usuarios SET contraseña = $1 WHERE id = $2',
            [hashNueva, req.usuario.id]
        );

        res.json({
            success: true,
            message: 'Contraseña actualizada correctamente'
        });

    } catch (error) {
        console.error('Error en cambiarPassword:', error);
        res.status(500).json({
            success: false,
            message: 'Error al cambiar contraseña'
        });
    }
}

/**
 * Utilidad: Genera hash de contraseña (para crear usuarios)
 */
export async function hashPassword(password) {
    return bcrypt.hash(password, 10);
}
