import bcrypt from 'bcrypt';
import { pool } from '../config/db.js';
import { registrarEvento, TIPOS_EVENTO, PRIORIDADES } from '../utils/eventos.js';

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
                u.empresa_id,
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
                r.tolerancia_id,
                r.posicion
            FROM roles r
            INNER JOIN usuarios_roles ur ON ur.rol_id = r.id
            WHERE ur.usuario_id = $1 AND ur.es_activo = true
            ORDER BY r.posicion ASC
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

        // Registrar evento de login exitoso
        await registrarEvento({
            titulo: 'Inicio de sesión',
            descripcion: `${usuarioData.nombre} inició sesión`,
            tipo_evento: TIPOS_EVENTO.AUTENTICACION,
            prioridad: PRIORIDADES.BAJA,
            empleado_id: usuarioData.empleado_id,
            detalles: { usuario_id: usuarioData.id, usuario: usuarioData.usuario, empresa_id: usuarioData.empresa_id }
        });

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
                    empresa_id: usuarioData.empresa_id,
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
 * POST /api/auth/impersonate
 * Inicia sesión temporalmente como el administrador principal de una empresa cliente (Solo SaaS)
 */
export async function impersonarEmpresa(req, res) {
    try {
        if (!req.usuario?.esPropietarioSaaS) {
            return res.status(403).json({ success: false, message: 'Acceso denegado: Solo para Propietarios SaaS' });
        }

        const { empresa_id } = req.body;
        if (!empresa_id) {
            return res.status(400).json({ success: false, message: 'ID de empresa requerido' });
        }

        // Buscar al administrador principal de esa empresa (el de rol con posición 0 o simplemente el primer admin activo)
        const resultado = await pool.query(`
            SELECT DISTINCT u.* 
            FROM usuarios u
            INNER JOIN usuarios_roles ur ON ur.usuario_id = u.id AND ur.es_activo = true
            INNER JOIN roles r ON ur.rol_id = r.id AND r.es_activo = true
            WHERE u.empresa_id = $1 AND u.estado_cuenta = 'activo' AND r.es_admin = true
            ORDER BY u.id ASC
            LIMIT 1
        `, [empresa_id]);

        if (resultado.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'No se encontró un administrador activo para esta empresa' });
        }

        const usuarioData = resultado.rows[0];
        delete usuarioData.contraseña;

        // Obtener roles del usuario
        const rolesResult = await pool.query(`
            SELECT
                r.id, r.nombre, r.descripcion, r.permisos_bitwise, r.es_admin, r.es_empleado, r.tolerancia_id, r.posicion
            FROM roles r
            INNER JOIN usuarios_roles ur ON ur.rol_id = r.id
            WHERE ur.usuario_id = $1 AND ur.es_activo = true
            ORDER BY r.posicion ASC
        `, [usuarioData.id]);

        let permisosCombinadosBigInt = BigInt(0);
        let esAdmin = false;

        for (const rol of rolesResult.rows) {
            if (rol.permisos_bitwise) permisosCombinadosBigInt |= BigInt(rol.permisos_bitwise);
            if (rol.es_admin) esAdmin = true;
        }

        // NO registramos evento de login normal, registramos evento SaaS
        await registrarEvento({
            titulo: 'Impersonación SaaS',
            descripcion: `SaaS Admin ingresó como ${usuarioData.nombre}`,
            tipo_evento: TIPOS_EVENTO.AUTENTICACION,
            prioridad: PRIORIDADES.ALTA,
            detalles: { admin_original: req.usuario.id, usuario_impersonado: usuarioData.id, empresa_id }
        });

        res.json({
            success: true,
            message: 'Iniciando sesión como cliente',
            data: {
                usuario: {
                    id: usuarioData.id,
                    usuario: usuarioData.usuario,
                    correo: usuarioData.correo,
                    nombre: usuarioData.nombre,
                    foto: usuarioData.foto,
                    telefono: usuarioData.telefono,
                    es_empleado: usuarioData.es_empleado,
                    empresa_id: usuarioData.empresa_id
                },
                roles: rolesResult.rows.map(r => ({
                    id: r.id, nombre: r.nombre, es_admin: r.es_admin, posicion: r.posicion
                })),
                permisos: permisosCombinadosBigInt.toString(),
                esAdmin,
                token: usuarioData.id // Token simple por ahora, igual que en login
            }
        });

    } catch (error) {
        console.error('Error en impersonarEmpresa:', error);
        res.status(500).json({ success: false, message: 'Error interno del servidor en impersonación' });
    }
}

/**
 * POST /api/auth/login-saas
 * Inicia sesión exclusivamente para Dueños de la Plataforma (SaaS)
 */
export async function loginSaaS(req, res) {
    try {
        const { usuario, contraseña } = req.body;

        if (!usuario || !contraseña) {
            return res.status(400).json({
                success: false,
                message: 'Usuario y contraseña son requeridos'
            });
        }

        const resultado = await pool.query(`
            SELECT id, usuario, correo, contraseña, nombre, estado_cuenta 
            FROM super_administradores 
            WHERE (usuario = $1 OR correo = $1)
        `, [usuario]);

        if (resultado.rows.length === 0) {
            return res.status(401).json({
                success: false,
                message: 'Credenciales inválidas o no tiene privilegios de SaaS'
            });
        }

        const adminData = resultado.rows[0];

        if (adminData.estado_cuenta !== 'activo') {
            return res.status(403).json({
                success: false,
                message: `Cuenta Maestra ${adminData.estado_cuenta}. Contacte a soporte.`
            });
        }

        const contraseñaValida = await bcrypt.compare(contraseña, adminData.contraseña);

        if (!contraseñaValida) {
            return res.status(401).json({
                success: false,
                message: 'Credenciales inválidas'
            });
        }

        delete adminData.contraseña;

        res.json({
            success: true,
            message: 'Inicio de sesión SaaS exitoso',
            data: {
                usuario: {
                    id: adminData.id,
                    usuario: adminData.usuario,
                    correo: adminData.correo,
                    nombre: adminData.nombre,
                    // Flags esenciales para el Frontend Maestro
                    esPropietarioSaaS: true,
                    esAdmin: true,
                    // Mock para compatibilidad con la estructura general
                    es_empleado: false,
                    empleado_id: null,
                    empresa_id: 'MASTER'
                },
                roles: [{ nombre: 'Propietario SaaS', es_admin: true, posicion: 0 }],
                permisos: '9223372036854775807', // Máximo valor BigInt para saltar validaciones en frontend si es necesario
                esAdmin: true,
                esPropietarioSaaS: true,
                // Usamos un prefijo en el token/ID para identificar que es una sesión SaaS
                token: 'saas_' + adminData.id
            }
        });

    } catch (error) {
        console.error('Error en loginSaaS:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor en portal SaaS'
        });
    }
}

/**
 * POST /api/auth/logout
 * Cierra sesión (para futuro uso con tokens/sesiones)
 */
export async function logout(req, res) {
    try {
        // Registrar evento de logout
        if (req.usuario) {
            await registrarEvento({
                titulo: 'Cierre de sesión',
                descripcion: `${req.usuario.nombre} cerró sesión`,
                tipo_evento: TIPOS_EVENTO.AUTENTICACION,
                prioridad: PRIORIDADES.BAJA,
                empleado_id: req.usuario.empleado_id,
                detalles: { usuario_id: req.usuario.id, empresa_id: req.usuario.empresa_id }
            });
        }

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
                    empleado_id: req.usuario.empleado_id,
                    empresa_id: req.usuario.empresa_id,
                    esPropietarioSaaS: req.usuario.esPropietarioSaaS
                },
                roles: req.usuario.roles,
                permisos: req.usuario.permisos,
                esAdmin: req.usuario.esAdmin,
                esPropietarioSaaS: req.usuario.esPropietarioSaaS
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

        // Registrar evento
        await registrarEvento({
            titulo: 'Contraseña cambiada',
            descripcion: `${req.usuario.nombre} cambió su contraseña`,
            tipo_evento: TIPOS_EVENTO.AUTENTICACION,
            prioridad: PRIORIDADES.MEDIA,
            empleado_id: req.usuario.empleado_id,
            detalles: { usuario_id: req.usuario.id }
        });

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

// POST /api/auth/biometric
export async function loginBiometrico(req, res) {
    try {
        const { empleado_id } = req.body;

        if (!empleado_id) {
            return res.status(400).json({
                success: false,
                message: 'empleado_id es requerido'
            });
        }

        // Buscar empleado y su usuario asociado
        const resultado = await pool.query(`
            SELECT
                u.id,
                u.usuario,
                u.correo,
                u.nombre,
                u.foto,
                u.telefono,
                u.estado_cuenta,
                u.es_empleado,
                u.empresa_id,
                e.id as empleado_id,
                e.rfc,
                e.nss,
                e.horario_id
            FROM empleados e
            INNER JOIN usuarios u ON u.id = e.usuario_id
            WHERE e.id = $1
        `, [empleado_id]);

        if (resultado.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Empleado no encontrado'
            });
        }

        const usuarioData = resultado.rows[0];

        if (usuarioData.estado_cuenta !== 'activo') {
            return res.status(403).json({
                success: false,
                message: `Cuenta ${usuarioData.estado_cuenta}. Contacte al administrador.`
            });
        }

        // Obtener roles
        const rolesResult = await pool.query(`
            SELECT r.id, r.nombre, r.es_admin, r.posicion, r.permisos_bitwise
            FROM roles r
            INNER JOIN usuarios_roles ur ON ur.rol_id = r.id
            WHERE ur.usuario_id = $1 AND ur.es_activo = true
            ORDER BY r.posicion ASC
        `, [usuarioData.id]);

        let permisosCombinadosBigInt = BigInt(0);
        let esAdmin = false;
        for (const rol of rolesResult.rows) {
            if (rol.permisos_bitwise) permisosCombinadosBigInt |= BigInt(rol.permisos_bitwise);
            if (rol.es_admin) esAdmin = true;
        }

        // Registrar evento de login biométrico
        await registrarEvento({
            titulo: 'Inicio de sesión biométrico',
            descripcion: `${usuarioData.nombre} inició sesión por huella digital`,
            tipo_evento: TIPOS_EVENTO.AUTENTICACION,
            prioridad: PRIORIDADES.BAJA,
            empleado_id: usuarioData.empleado_id,
            detalles: { usuario_id: usuarioData.id, usuario: usuarioData.usuario, metodo: 'biometrico', empresa_id: usuarioData.empresa_id }
        });

        res.json({
            success: true,
            message: 'Autenticación biométrica exitosa',
            data: {
                usuario: {
                    id: usuarioData.id,
                    usuario: usuarioData.usuario,
                    correo: usuarioData.correo,
                    nombre: usuarioData.nombre,
                    foto: usuarioData.foto,
                    telefono: usuarioData.telefono,
                    es_empleado: true,  // Siempre true porque viene de tabla empleados
                    empresa_id: usuarioData.empresa_id,
                    empleado_id: usuarioData.empleado_id,
                    rfc: usuarioData.rfc,
                    nss: usuarioData.nss,
                    horario_id: usuarioData.horario_id
                },
                roles: rolesResult.rows.map(r => ({
                    id: r.id,
                    nombre: r.nombre,
                    es_admin: r.es_admin,
                    posicion: r.posicion
                })),
                permisos: permisosCombinadosBigInt.toString(),
                esAdmin,
                token: usuarioData.id
            }
        });
    } catch (error) {
        console.error('Error en loginBiometrico:', error);
        res.status(500).json({ success: false, message: 'Error interno del servidor' });
    }
}
