/**
 * Sistema de Permisos Bitwise
 * Maneja hasta 64 permisos diferentes usando operaciones bit a bit
 *
 * Cada permiso ocupa una posición de bit (0-63)
 * permisos_bitwise es un BIGINT que almacena todos los permisos
 */

/**
 * Catálogo de permisos con sus posiciones de bit
 * Debe coincidir con la tabla permisos_catalogo
 */
export const PERMISOS = {
    // USUARIO (0-3)
    USUARIO_VER: 0,
    USUARIO_CREAR: 1,
    USUARIO_MODIFICAR: 2,
    USUARIO_SOFTDELETE: 3,

    // ROLES (4-8)
    ROL_VER: 4,
    ROL_CREAR: 5,
    ROL_MODIFICAR: 6,
    ROL_ASIGNAR: 7,
    ROL_SOFTDELETE: 8,

    // HORARIOS (9-13)
    HORARIO_VER: 9,
    HORARIO_CREAR: 10,
    HORARIO_MODIFICAR: 11,
    HORARIO_ASIGNAR: 12,
    HORARIO_SOFTDELETE: 13,

    // DISPOSITIVOS (14-17)
    DISPOSITIVO_VER: 14,
    DISPOSITIVO_CREAR: 15,
    DISPOSITIVO_MODIFICAR: 16,
    DISPOSITIVO_ACEPTAR_SOLICITUD: 17,

    // DEPARTAMENTOS (18-22)
    DEPARTAMENTO_VER: 18,
    DEPARTAMENTO_CREAR: 19,
    DEPARTAMENTO_MODIFICAR: 20,
    DEPARTAMENTO_ASIGNAR: 21,
    DEPARTAMENTO_SOFTDELETE: 22,

    // REGISTRO (23)
    REGISTRO_VER: 23,

    // CONFIGURACIÓN (24-25)
    CONFIGURACION_VER: 24,
    CONFIGURACION_MODIFICAR: 25,

    // REPORTES (26)
    REPORTE_EXPORTAR: 26,

    // SISTEMA (63) - Reservado para super admin
    SUPER_ADMIN: 63
};

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
 * Verifica si es super admin (tiene todos los permisos)
 * @param {bigint|number|string} permisosBitwise
 * @returns {boolean}
 */
export function esSuperAdmin(permisosBitwise) {
    return tienePermiso(permisosBitwise, PERMISOS.SUPER_ADMIN);
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
    for (const [codigo, bitPos] of Object.entries(PERMISOS)) {
        if (tienePermiso(permisosBitwise, bitPos)) {
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
 * Convierte permisos bitwise a formato legible para JSON
 * @param {bigint} permisosBitwise
 * @returns {string}
 */
export function permisosToString(permisosBitwise) {
    return permisosBitwise.toString();
}

/**
 * Grupos de permisos para asignación rápida
 */
export const GRUPOS_PERMISOS = {
    ADMIN_COMPLETO: crearPermisos([
        PERMISOS.USUARIO_VER, PERMISOS.USUARIO_CREAR, PERMISOS.USUARIO_MODIFICAR, PERMISOS.USUARIO_SOFTDELETE,
        PERMISOS.ROL_VER, PERMISOS.ROL_CREAR, PERMISOS.ROL_MODIFICAR, PERMISOS.ROL_ASIGNAR, PERMISOS.ROL_SOFTDELETE,
        PERMISOS.HORARIO_VER, PERMISOS.HORARIO_CREAR, PERMISOS.HORARIO_MODIFICAR, PERMISOS.HORARIO_ASIGNAR, PERMISOS.HORARIO_SOFTDELETE,
        PERMISOS.DISPOSITIVO_VER, PERMISOS.DISPOSITIVO_CREAR, PERMISOS.DISPOSITIVO_MODIFICAR, PERMISOS.DISPOSITIVO_ACEPTAR_SOLICITUD,
        PERMISOS.DEPARTAMENTO_VER, PERMISOS.DEPARTAMENTO_CREAR, PERMISOS.DEPARTAMENTO_MODIFICAR, PERMISOS.DEPARTAMENTO_ASIGNAR, PERMISOS.DEPARTAMENTO_SOFTDELETE,
        PERMISOS.REGISTRO_VER,
        PERMISOS.CONFIGURACION_VER, PERMISOS.CONFIGURACION_MODIFICAR,
        PERMISOS.REPORTE_EXPORTAR,
        PERMISOS.SUPER_ADMIN
    ]),
    EMPLEADO_BASICO: crearPermisos([
        PERMISOS.REGISTRO_VER
    ]),
    SUPERVISOR: crearPermisos([
        PERMISOS.USUARIO_VER,
        PERMISOS.REGISTRO_VER,
        PERMISOS.REPORTE_EXPORTAR
    ])
};
