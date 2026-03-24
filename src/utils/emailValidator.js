import dns from 'dns';
import { promisify } from 'util';

const resolveMx = promisify(dns.resolveMx);

/**
 * Valida si un correo tiene formato correcto y si su dominio tiene registros MX activos.
 * @param {string} email - Correo a validar
 * @returns {Promise<boolean>} true si es válido y verificable, false de lo contrario
 */
export async function validarCorreoReal(email) {
    if (!email || typeof email !== 'string') return false;

    // Validación básica de formato
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) return false;

    const domain = email.split('@')[1];

    try {
        const mxRecords = await resolveMx(domain);
        return mxRecords && mxRecords.length > 0;
    } catch (error) {
        // Códigos de error comunes de Node.js para dominios inexistentes o sin registros MX
        if (error.code === 'ENOTFOUND' || error.code === 'ENODATA') {
            return false;
        }
        // Si hay otro tipo de error (ej. timeout de red), asumimos false por precaución,
        // o podríamos retornar err/false dependiendo de la criticidad. Asumiremos falso.
        return false;
    }
}
