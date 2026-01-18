/**
 * Middleware de Permisos Bitwise
 * Verifica que el usuario tenga los permisos necesarios para acceder a recursos
 */

import { tienePermiso, esSuperAdmin, PERMISOS } from '../utils/permissions.js';

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

        // Si es super admin, tiene acceso a todo
        if (esSuperAdmin(permisosBitwise)) {
            return next();
        }

        // Verificar cada permiso requerido (OR)
        for (const permiso of permisosRequeridos) {
            const bitPosition = typeof permiso === 'string' ? PERMISOS[permiso] : permiso;

            if (bitPosition !== undefined && tienePermiso(permisosBitwise, bitPosition)) {
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

        // Si es super admin, tiene acceso a todo
        if (esSuperAdmin(permisosBitwise)) {
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

        if (esSuperAdmin(permisosBitwise)) {
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
        modificar: requirePermiso('USUARIO_MODIFICAR'),
        eliminar: requirePermiso('USUARIO_SOFTDELETE'),
        cualquiera: requirePermiso('USUARIO_VER', 'USUARIO_CREAR', 'USUARIO_MODIFICAR', 'USUARIO_SOFTDELETE')
    },
    roles: {
        ver: requirePermiso('ROL_VER'),
        crear: requirePermiso('ROL_CREAR'),
        modificar: requirePermiso('ROL_MODIFICAR'),
        asignar: requirePermiso('ROL_ASIGNAR'),
        eliminar: requirePermiso('ROL_SOFTDELETE'),
        cualquiera: requirePermiso('ROL_VER', 'ROL_CREAR', 'ROL_MODIFICAR', 'ROL_ASIGNAR', 'ROL_SOFTDELETE')
    },
    horarios: {
        ver: requirePermiso('HORARIO_VER'),
        crear: requirePermiso('HORARIO_CREAR'),
        modificar: requirePermiso('HORARIO_MODIFICAR'),
        asignar: requirePermiso('HORARIO_ASIGNAR'),
        eliminar: requirePermiso('HORARIO_SOFTDELETE')
    },
    dispositivos: {
        ver: requirePermiso('DISPOSITIVO_VER'),
        crear: requirePermiso('DISPOSITIVO_CREAR'),
        modificar: requirePermiso('DISPOSITIVO_MODIFICAR'),
        aceptarSolicitud: requirePermiso('DISPOSITIVO_ACEPTAR_SOLICITUD')
    },
    departamentos: {
        ver: requirePermiso('DEPARTAMENTO_VER'),
        crear: requirePermiso('DEPARTAMENTO_CREAR'),
        modificar: requirePermiso('DEPARTAMENTO_MODIFICAR'),
        asignar: requirePermiso('DEPARTAMENTO_ASIGNAR'),
        eliminar: requirePermiso('DEPARTAMENTO_SOFTDELETE')
    },
    registro: {
        ver: requirePermiso('REGISTRO_VER')
    },
    configuracion: {
        ver: requirePermiso('CONFIGURACION_VER'),
        modificar: requirePermiso('CONFIGURACION_MODIFICAR')
    },
    reportes: {
        exportar: requirePermiso('REPORTE_EXPORTAR')
    }
};

// Re-exportar PERMISOS para conveniencia
export { PERMISOS };
