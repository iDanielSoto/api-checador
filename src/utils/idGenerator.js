import { pool } from '../config/db.js';

/**
 * Prefijos estándar para cada entidad (3 caracteres)
 */
export const ID_PREFIXES = {
    USUARIO: 'USU',
    EMPLEADO: 'EMP',
    ROL: 'ROL',
    DEPARTAMENTO: 'DEP',
    HORARIO: 'HOR',
    TOLERANCIA: 'TOL',
    ASISTENCIA: 'ASI',
    INCIDENCIA: 'INC',
    CREDENCIAL: 'CRE',
    ESCRITORIO: 'ESC',
    MOVIL: 'MOV',
    BIOMETRICO: 'BIO',
    SOLICITUD: 'SOL',
    EVENTO: 'EVT',
    CONFIGURACION: 'CFG',
    EMPRESA: 'EMA',
    MODULO: 'MOD',
    PERMISO: 'PRM',
    USUARIO_ROL: 'URL',
    EMP_DEPTO: 'EDO',
    AUDITORIA: 'AUD',
    DIA_FESTIVO: 'FES'
};

/**
 * Mapeo de prefijo a nombre de secuencia en BD
 */
const SEQUENCE_NAMES = {
    USU: 'seq_usuarios',
    EMP: 'seq_empleados',
    ROL: 'seq_roles',
    DEP: 'seq_departamentos',
    HOR: 'seq_horarios',
    TOL: 'seq_tolerancias',
    ASI: 'seq_asistencias',
    INC: 'seq_incidencias',
    CRE: 'seq_credenciales',
    ESC: 'seq_escritorio',
    MOV: 'seq_movil',
    BIO: 'seq_biometrico',
    SOL: 'seq_solicitudes',
    EVT: 'seq_eventos',
    CFG: 'seq_configuraciones',
    EMA: 'seq_empresas',
    MOD: 'seq_modulos',
    PRM: 'seq_permisos',
    URL: 'seq_usuarios_roles',
    EDO: 'seq_empleados_departamentos',
    AUD: 'seq_auditoria',
    FES: 'seq_dias_festivos'
};

/**
 * Genera un ID secuencial con prefijo
 * Formato: PPP + XXXXX (3 caracteres + 5 hex)
 * Ejemplo: USU00001, USU0000F, USU00010
 *
 * @param {string} prefix - Prefijo de 3 caracteres (ej: 'USU', 'ROL', 'EMP')
 * @returns {Promise<string>} ID de 8 caracteres
 */
export async function generateId(prefix) {
    const prefixClean = prefix.toUpperCase().slice(0, 3);
    const sequenceName = SEQUENCE_NAMES[prefixClean];

    if (!sequenceName) {
        throw new Error(`Prefijo desconocido: ${prefixClean}`);
    }

    const result = await pool.query(`SELECT nextval('${sequenceName}') as num`);
    const num = parseInt(result.rows[0].num);

    // Convertir a hexadecimal y rellenar con ceros (5 dígitos)
    const hexPart = num.toString(16).toUpperCase().padStart(5, '0');

    return prefixClean + hexPart;
}

/**
 * Genera múltiples IDs en una sola llamada (más eficiente para inserciones masivas)
 * @param {string} prefix - Prefijo de 3 caracteres
 * @param {number} count - Cantidad de IDs a generar
 * @returns {Promise<string[]>} Array de IDs
 */
export async function generateIds(prefix, count) {
    const prefixClean = prefix.toUpperCase().slice(0, 3);
    const sequenceName = SEQUENCE_NAMES[prefixClean];

    if (!sequenceName) {
        throw new Error(`Prefijo desconocido: ${prefixClean}`);
    }

    const ids = [];
    for (let i = 0; i < count; i++) {
        const result = await pool.query(`SELECT nextval('${sequenceName}') as num`);
        const num = parseInt(result.rows[0].num);
        const hexPart = num.toString(16).toUpperCase().padStart(5, '0');
        ids.push(prefixClean + hexPart);
    }

    return ids;
}

/**
 * Genera un token numérico de 6 dígitos (para solicitudes)
 * @returns {string} Token de 6 dígitos
 */
export function generateToken() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Genera una clave de seguridad única (para usuarios)
 * @returns {number} Clave numérica de 6-8 dígitos
 */
export function generateSecurityKey() {
    return Math.floor(10000000 + Math.random() * 90000000);
}
