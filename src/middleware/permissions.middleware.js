/**
 * Middleware de Permisos Bitwise
 * Verifica que el usuario tenga los permisos necesarios para acceder a recursos
 */

import { tienePermiso, PERMISOS, esMaestro, JERARQUIA_CONFIGURACION } from '../utils/permissions.js';

/**
 * Crea un middleware que verifica uno o más permisos
 * El usuario debe tener AL MENOS UNO de los permisos especificados
 *
 * @param {...(number|string)} permisosRequeridos - Posiciones de bit o códigos de permiso
 * @returns {import('express').RequestHandler}
 *
 * @example
 * // Por posición de bit
 * router.get('/usuarios', requirePermiso(0)); // USUARIO_VER
 *
 * // Por código
 * router.get('/usuarios', requirePermiso('USUARIO_VER'));
 *
 * // Múltiples (OR - requiere al menos uno)
 * router.get('/usuarios', requirePermiso('USUARIO_VER', 'SUPER_ADMIN'));
 */
export function requirePermiso(...permisosRequeridos) {
    return (req, res, next) => {
        // Verificar que el usuario esté autenticado
        if (!req.usuario) {
            return res.status(401).json({
                success: false,
                message: 'No autenticado'
            });
        }

        const permisosBitwise = req.usuario.permisosBigInt || BigInt(0);

        // Si es dueño del sistema o administrador maestro, tiene acceso a todo
        if (esMaestro(req.usuario) || req.usuario.esAdmin) {
            return next();
        }

        if (permisosRequeridos.length === 0) return next();

        // Verificar cada permiso requerido (OR)
        for (const permiso of permisosRequeridos) {
            const codigo = typeof permiso === 'string' ? permiso : Object.keys(PERMISOS).find(k => PERMISOS[k] === permiso);
            const bitPosition = typeof permiso === 'string' ? PERMISOS[permiso] : permiso;

            if (bitPosition !== undefined && tienePermiso(permisosBitwise, bitPosition)) {
                // Si es un permiso de CONFIG, validar también la JERARQUIA
                if (codigo && codigo.startsWith('CONFIG_')) {
                    const rangoRequerido = JERARQUIA_CONFIGURACION[codigo];
                    const mejorPosicion = req.usuario.mejorPosicion || 999;

                    if (rangoRequerido !== undefined && mejorPosicion > rangoRequerido) {
                        // El usuario TIENE EL BIT, pero NO tiene la jerarquía requerida
                        continue; 
                    }
                }
                return next();
            }
        }

        return res.status(403).json({
            success: false,
            message: 'No tiene permisos para realizar esta acción',
            permisosRequeridos: permisosRequeridos.map(p =>
                typeof p === 'string' ? p : Object.keys(PERMISOS).find(k => PERMISOS[k] === p)
            )
        });
    };
}

/**
 * Crea un middleware que verifica TODOS los permisos especificados
 * El usuario debe tener TODOS los permisos (AND)
 *
 * @param {...(number|string)} permisosRequeridos
 * @returns {import('express').RequestHandler}
 */
export function requireAllPermisos(...permisosRequeridos) {
    return (req, res, next) => {
        if (!req.usuario) {
            return res.status(401).json({
                success: false,
                message: 'No autenticado'
            });
        }

        const permisosBitwise = req.usuario.permisosBigInt || BigInt(0);

        // Si es dueño del sistema o administrador maestro, tiene acceso a todo
        if (esMaestro(req.usuario) || req.usuario.esAdmin) {
            return next();
        }

        const permisosFaltantes = [];

        for (const permiso of permisosRequeridos) {
            const bitPosition = typeof permiso === 'string' ? PERMISOS[permiso] : permiso;

            if (bitPosition === undefined || !tienePermiso(permisosBitwise, bitPosition)) {
                permisosFaltantes.push(
                    typeof permiso === 'string' ? permiso : Object.keys(PERMISOS).find(k => PERMISOS[k] === permiso)
                );
            }
        }

        if (permisosFaltantes.length > 0) {
            return res.status(403).json({
                success: false,
                message: 'Permisos insuficientes',
                permisosFaltantes
            });
        }

        next();
    };
}

/**
 * Middleware que verifica si puede acceder a su propio recurso o tiene permiso
 * Útil para endpoints como /usuarios/:id donde el usuario puede ver su propia info
 *
 * @param {string} paramIdName - Nombre del parámetro en req.params (default: 'id')
 * @param {...(number|string)} permisosRequeridos - Permisos para acceder a recursos de otros
 */
export function requirePermisoOrSelf(paramIdName = 'id', ...permisosRequeridos) {
    return (req, res, next) => {
        if (!req.usuario) {
            return res.status(401).json({
                success: false,
                message: 'No autenticado'
            });
        }

        const targetId = req.params[paramIdName];

        // Si es su propio recurso, permitir
        if (targetId === req.usuario.id || targetId === req.usuario.empleado_id) {
            return next();
        }

        // Si no es su recurso, verificar permisos
        const permisosBitwise = req.usuario.permisosBigInt || BigInt(0);

        if (esMaestro(req.usuario) || req.usuario.esAdmin) {
            return next();
        }

        for (const permiso of permisosRequeridos) {
            const bitPosition = typeof permiso === 'string' ? PERMISOS[permiso] : permiso;

            if (bitPosition !== undefined && tienePermiso(permisosBitwise, bitPosition)) {
                return next();
            }
        }

        return res.status(403).json({
            success: false,
            message: 'No tiene permisos para acceder a este recurso'
        });
    };
}

/**
 * Middleware para verificar permisos específicos de módulo
 * Agrupa CRUD completo de un módulo
 */
export const permisosPorModulo = {
    usuarios: {
        ver: requirePermiso('USUARIO_VER'),
        crear: requirePermiso('USUARIO_CREAR'),
        editar: requirePermiso('USUARIO_EDITAR'),
        eliminar: requirePermiso('USUARIO_ELIMINAR'),
        cualquiera: requirePermiso('USUARIO_VER', 'USUARIO_CREAR', 'USUARIO_EDITAR', 'USUARIO_ELIMINAR')
    },
    roles: {
        ver: requirePermiso('ROL_VER'),
        crear: requirePermiso('ROL_CREAR'),
        editar: requirePermiso('ROL_EDITAR'),
        asignar: requirePermiso('ROL_ASIGNAR'),
        eliminar: requirePermiso('ROL_ELIMINAR'),
        cualquiera: requirePermiso('ROL_VER', 'ROL_CREAR', 'ROL_EDITAR', 'ROL_ASIGNAR', 'ROL_ELIMINAR')
    },
    horarios: {
        ver: requirePermiso('HORARIO_VER'),
        crear: requirePermiso('HORARIO_CREAR'),
        editar: requirePermiso('HORARIO_EDITAR'),
        asignar: requirePermiso('HORARIO_ASIGNAR'),
        eliminar: requirePermiso('HORARIO_ELIMINAR'),
        gestionar: requirePermiso('HORARIO_GESTIONAR')
    },
    dispositivos: {
        ver: requirePermiso('DISPOSITIVO_VER'),
        crear: requirePermiso('DISPOSITIVO_CREAR'),
        editar: requirePermiso('DISPOSITIVO_EDITAR'),
        eliminar: requirePermiso('DISPOSITIVO_ELIMINAR'),
        gestionar: requirePermiso('DISPOSITIVO_GESTIONAR')
    },
    departamentos: {
        ver: requirePermiso('DEPARTAMENTO_VER'),
        crear: requirePermiso('DEPARTAMENTO_CREAR'),
        editar: requirePermiso('DEPARTAMENTO_EDITAR'),
        asignar: requirePermiso('DEPARTAMENTO_ASIGNAR'),
        eliminar: requirePermiso('DEPARTAMENTO_ELIMINAR')
    },
    registro: {
        ver: requirePermiso('REGISTRO_VER')
    },
    avisos: {
        ver: requirePermiso('AVISO_VER'),
        crear: requirePermiso('AVISO_CREAR'),
        editar: requirePermiso('AVISO_EDITAR'),
        eliminar: requirePermiso('AVISO_ELIMINAR')
    },
    configuracion: {
        ver: requirePermiso('CONFIG_VER'),
        general: requirePermiso('CONFIG_GENERAL'),
        empresa: requirePermiso('CONFIG_EMPRESA'),
        seguridad: requirePermiso('CONFIG_SEGURIDAD'),
        asistencia: requirePermiso('CONFIG_ASISTENCIA'),
        red: requirePermiso('CONFIG_RED'),
        reportes: requirePermiso('CONFIG_REPORTES')
    },
    reportes: {
        ver: requirePermiso('REPORTE_VER'),
        exportar: requirePermiso('REPORTE_EXPORTAR')
    }
};

// Re-exportar PERMISOS para conveniencia
export { PERMISOS };
