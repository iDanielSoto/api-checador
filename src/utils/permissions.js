/**
 * Sistema de Permisos Bitwise
 * Maneja hasta 64 permisos diferentes usando operaciones bit a bit
 */

/**
 * Catálogo de Módulos
 * Define la estructura de navegación y visualización del sistema
 */
export const CATALOGO_MODULOS = [
    { id: 'dashboard', nombre: 'Dashboard', icono: 'home', orden: 1, ruta: '/' },
    { id: 'usuarios', nombre: 'Usuarios y Roles', icono: 'users', orden: 2, ruta: '/usuarios' },
    { id: 'empleados', nombre: 'Empleados', icono: 'user-check', orden: 3, ruta: '/empleados' },
    { id: 'asistencias', nombre: 'Asistencias', icono: 'check-circle', orden: 4, ruta: '/asistencias' },
    { id: 'horarios', nombre: 'Horarios e Incidencias', icono: 'clock', orden: 5, ruta: '/horarios' },
    { id: 'departamentos', nombre: 'Departamentos', icono: 'trello', orden: 6, ruta: '/departamentos' },
    { id: 'dispositivos', nombre: 'Dispositivos', icono: 'monitor', orden: 7, ruta: '/dispositivos' },
    { id: 'avisos', nombre: 'Avisos', icono: 'megaphone', orden: 8, ruta: '/avisos' },
    { id: 'reportes', nombre: 'Reportes', icono: 'bar-chart', orden: 9, ruta: '/reportes' },
    { id: 'configuracion', nombre: 'Configuración', icono: 'settings', orden: 10, ruta: '/configuracion' }
];

/**
 * Catálogo Detallado de Permisos
 * Mapeo de bits (0-63) a acciones específicas por módulo
 */
export const CATALOGO_PERMISOS = {
    // USUARIOS Y EMPLEADOS (0-3)
    USUARIO_VER: { bit: 0, nombre: 'Ver usuarios y empleados', descripcion: 'Permite ver la lista de usuarios y empleados', categoria: 'usuarios' },
    USUARIO_CREAR: { bit: 1, nombre: 'Crear usuarios y empleados', descripcion: 'Permite registrar nuevos usuarios y empleados', categoria: 'usuarios' },
    USUARIO_EDITAR: { bit: 2, nombre: 'Editar usuarios y empleados', descripcion: 'Permite modificar datos de usuarios y empleados existentes', categoria: 'usuarios' },
    USUARIO_ELIMINAR: { bit: 3, nombre: 'Desactivar usuarios y empleados', descripcion: 'Permite cambiar el estado o desactivar usuarios y empleados', categoria: 'usuarios' },

    // ROLES (4-8)
    ROL_VER: { bit: 4, nombre: 'Ver roles', descripcion: 'Permite ver la lista de roles del sistema', categoria: 'roles' },
    ROL_CREAR: { bit: 5, nombre: 'Crear roles', descripcion: 'Permite crear nuevos roles de usuario', categoria: 'roles' },
    ROL_EDITAR: { bit: 6, nombre: 'Editar roles', descripcion: 'Permite modificar la configuración de roles existentes', categoria: 'roles' },
    ROL_ELIMINAR: { bit: 7, nombre: 'Desactivar roles', descripcion: 'Permite desactivar roles de usuario', categoria: 'roles' },
    ROL_ASIGNAR: { bit: 8, nombre: 'Asignar roles', descripcion: 'Permite asignar roles a los usuarios', categoria: 'roles' },

    // HORARIOS E INCIDENCIAS (9-14)
    HORARIO_VER: { bit: 9, nombre: 'Ver horarios e incidencias', descripcion: 'Permite visualizar horarios e incidencias', categoria: 'horarios' },
    HORARIO_CREAR: { bit: 10, nombre: 'Crear horarios e incidencias', descripcion: 'Permite registrar nuevos horarios o incidencias', categoria: 'horarios' },
    HORARIO_EDITAR: { bit: 11, nombre: 'Editar horarios e incidencias', descripcion: 'Permite modificar horarios o incidencias existentes', categoria: 'horarios' },
    HORARIO_ELIMINAR: { bit: 12, nombre: 'Desactivar horarios e incidencias', descripcion: 'Permite desactivar horarios o incidencias', categoria: 'horarios' },
    HORARIO_ASIGNAR: { bit: 13, nombre: 'Asignar horarios', descripcion: 'Permite asignar horarios a empleados', categoria: 'horarios' },
    HORARIO_GESTIONAR: { bit: 14, nombre: 'Aprobar/Declinar incidencias', descripcion: 'Permite aprobar o declinar solicitudes de incidencias', categoria: 'horarios' },

    // DEPARTAMENTOS (15-19)
    DEPARTAMENTO_VER: { bit: 15, nombre: 'Ver departamentos', descripcion: 'Permite ver la lista de departamentos', categoria: 'departamentos' },
    DEPARTAMENTO_CREAR: { bit: 16, nombre: 'Crear departamentos', descripcion: 'Permite crear nuevos departamentos', categoria: 'departamentos' },
    DEPARTAMENTO_EDITAR: { bit: 17, nombre: 'Editar departamentos', descripcion: 'Permite modificar departamentos existentes', categoria: 'departamentos' },
    DEPARTAMENTO_ELIMINAR: { bit: 18, nombre: 'Desactivar departamentos', descripcion: 'Permite desactivar departamentos', categoria: 'departamentos' },
    DEPARTAMENTO_ASIGNAR: { bit: 19, nombre: 'Asignar departamentos', descripcion: 'Permite asignar empleados a departamentos', categoria: 'departamentos' },

    // DISPOSITIVOS (20-24)
    DISPOSITIVO_VER: { bit: 20, nombre: 'Ver dispositivos', descripcion: 'Permite ver la lista de dispositivos (biométricos/kioscos)', categoria: 'dispositivos' },
    DISPOSITIVO_CREAR: { bit: 21, nombre: 'Registrar dispositivos', descripcion: 'Permite registrar nuevos dispositivos en el sistema', categoria: 'dispositivos' },
    DISPOSITIVO_EDITAR: { bit: 22, nombre: 'Editar dispositivos', descripcion: 'Permite modificar la configuración de los dispositivos', categoria: 'dispositivos' },
    DISPOSITIVO_ELIMINAR: { bit: 23, nombre: 'Desactivar dispositivos', descripcion: 'Permite desactivar dispositivos', categoria: 'dispositivos' },
    DISPOSITIVO_GESTIONAR: { bit: 24, nombre: 'Aprobar/Declinar suscripciones', descripcion: 'Permite gestionar las solicitudes de vinculación de dispositivos', categoria: 'dispositivos' },

    // AVISOS (25-28)
    AVISO_VER: { bit: 25, nombre: 'Ver avisos', descripcion: 'Permite visualizar los avisos del sistema', categoria: 'avisos' },
    AVISO_CREAR: { bit: 26, nombre: 'Crear avisos', descripcion: 'Permite crear nuevos avisos globales o específicos', categoria: 'avisos' },
    AVISO_EDITAR: { bit: 27, nombre: 'Editar avisos', descripcion: 'Permite modificar avisos existentes', categoria: 'avisos' },
    AVISO_ELIMINAR: { bit: 28, nombre: 'Desactivar avisos', descripcion: 'Permite desactivar o eliminar avisos', categoria: 'avisos' },

    // REPORTES (29-30)
    REPORTE_VER: { bit: 29, nombre: 'Ver reportes', descripcion: 'Permite visualizar el módulo de reportes y estadísticas', categoria: 'reportes' },
    REPORTE_EXPORTAR: { bit: 30, nombre: 'Exportar reportes', descripcion: 'Permite generar y exportar reportes en PDF/Excel', categoria: 'reportes' },

    // REGISTROS (31)
    REGISTRO_VER: { bit: 31, nombre: 'Ver registros de asistencia', descripcion: 'Permite visualizar los registros de entrada y salida', categoria: 'asistencias' },

    // CONFIGURACIÓN (32-38)
    CONFIG_VER: { bit: 32, nombre: 'Ver configuración', descripcion: 'Permite ver el panel de configuración del sistema', categoria: 'configuracion' },
    CONFIG_GENERAL: { bit: 33, nombre: 'Modificar configuración general', descripcion: 'Permite modificar aspectos generales del sistema', categoria: 'configuracion' },
    CONFIG_EMPRESA: { bit: 34, nombre: 'Modificar configuración de empresa', descripcion: 'Permite modificar datos de la empresa', categoria: 'configuracion' },
    CONFIG_SEGURIDAD: { bit: 35, nombre: 'Modificar configuración de seguridad', descripcion: 'Permite modificar parámetros de seguridad', categoria: 'configuracion' },
    CONFIG_ASISTENCIA: { bit: 36, nombre: 'Modificar configuración de asistencia', descripcion: 'Permite modificar reglas de asistencia', categoria: 'configuracion' },
    CONFIG_RED: { bit: 37, nombre: 'Modificar configuración de red', descripcion: 'Permite modificar parámetros de red/IPs', categoria: 'configuracion' },
    CONFIG_REPORTES: { bit: 38, nombre: 'Modificar configuración de reportes', descripcion: 'Permite modificar la estructura de los reportes', categoria: 'configuracion' }
};

/**
 * Mapeo simple de CODIGO -> bit_position para compatibilidad
 */
export const PERMISOS = Object.keys(CATALOGO_PERMISOS).reduce((acc, key) => {
    acc[key] = CATALOGO_PERMISOS[key].bit;
    return acc;
}, {});

/**
 * Verifica si un valor de permisos tiene un permiso específico
 * @param {bigint|number|string} permisosBitwise - Valor de permisos del rol
 * @param {number} bitPosition - Posición del bit a verificar (0-63)
 * @returns {boolean}
 */
export function tienePermiso(permisosBitwise, bitPosition) {
    const permisos = BigInt(permisosBitwise || 0);
    const mask = BigInt(1) << BigInt(bitPosition);
    return (permisos & mask) !== BigInt(0);
}

/**
 * Verifica si tiene el permiso por código
 * @param {bigint|number|string} permisosBitwise - Valor de permisos
 * @param {string} codigoPermiso - Código del permiso (ej: 'USUARIO_VER')
 * @returns {boolean}
 */
export function tienePermisoPorCodigo(permisosBitwise, codigoPermiso) {
    const bitPosition = PERMISOS[codigoPermiso];
    if (bitPosition === undefined) {
        console.warn(`Permiso desconocido: ${codigoPermiso}`);
        return false;
    }
    return tienePermiso(permisosBitwise, bitPosition);
}

/**
 * Agrega un permiso al valor existente
 * @param {bigint|number|string} permisosBitwise
 * @param {number} bitPosition
 * @returns {bigint}
 */
export function agregarPermiso(permisosBitwise, bitPosition) {
    const permisos = BigInt(permisosBitwise || 0);
    const mask = BigInt(1) << BigInt(bitPosition);
    return permisos | mask;
}

/**
 * Remueve un permiso del valor existente
 * @param {bigint|number|string} permisosBitwise
 * @param {number} bitPosition
 * @returns {bigint}
 */
export function removerPermiso(permisosBitwise, bitPosition) {
    const permisos = BigInt(permisosBitwise || 0);
    const mask = BigInt(1) << BigInt(bitPosition);
    return permisos & ~mask;
}

/**
 * Crea un valor de permisos desde un array de posiciones
 * @param {number[]} posiciones - Array de posiciones de bit
 * @returns {bigint}
 */
export function crearPermisos(posiciones) {
    let permisos = BigInt(0);
    for (const pos of posiciones) {
        permisos = agregarPermiso(permisos, pos);
    }
    return permisos;
}

/**
 * Obtiene la lista de permisos activos como array de códigos
 * @param {bigint|number|string} permisosBitwise
 * @returns {string[]}
 */
export function obtenerPermisosActivos(permisosBitwise) {
    const activos = [];
    for (const [codigo, meta] of Object.entries(CATALOGO_PERMISOS)) {
        if (tienePermiso(permisosBitwise, meta.bit)) {
            activos.push(codigo);
        }
    }
    return activos;
}

/**
 * Combina los permisos de múltiples roles
 * @param {Array<{permisos_bitwise: bigint|number|string}>} roles
 * @returns {bigint}
 */
export function combinarPermisosDeRoles(roles) {
    let permisosCombinados = BigInt(0);
    for (const rol of roles) {
        if (rol.permisos_bitwise) {
            permisosCombinados |= BigInt(rol.permisos_bitwise);
        }
    }
    return permisosCombinados;
}

/**
 * Verifica si es super admin / dueño del sistema (acceso total)
 * @param {object} usuario - Objeto de usuario del request
 * @returns {boolean}
 */
export function esMaestro(usuario) {
    return usuario?.esPropietarioSaaS || usuario?.empresa_id === 'MASTER';
}

/**
 * Umbrales de Jerarquía para Configuración
 * Define la posición máxima permitida para cada permiso de configuración.
 * (A menor número, mayor jerarquía: 1 es Dueño/Raíz)
 */
export const JERARQUIA_CONFIGURACION = {
    CONFIG_VER: 99,       // Cualquier admin puede ver
    CONFIG_REPORTES: 99,  // Cualquier admin puede ver reportes
    CONFIG_GENERAL: 5,    // Solo gerencia y superior
    CONFIG_ASISTENCIA: 5, // Solo gerencia y superior
    CONFIG_RED: 2,        // Solo IT/Gerencia alta
    CONFIG_EMPRESA: 1,    // Solo dueño del sistema/empresa
    CONFIG_SEGURIDAD: 1   // Solo dueño del sistema/empresa
};

/**
 * Grupos de permisos para asignación rápida
 */
export const GRUPOS_PERMISOS = {
    ADMIN_ESTANDAR: crearPermisos(Object.values(PERMISOS)),
    EMPLEADO_BASICO: crearPermisos([
        PERMISOS.REGISTRO_VER
    ]),
    SUPERVISOR: crearPermisos([
        PERMISOS.USUARIO_VER,
        PERMISOS.REGISTRO_VER,
        PERMISOS.REPORTE_VER,
        PERMISOS.REPORTE_EXPORTAR,
        PERMISOS.HORARIO_VER,
        PERMISOS.HORARIO_GESTIONAR
    ])
};
