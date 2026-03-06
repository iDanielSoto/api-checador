import { pool } from '../../config/db.js';
import * as reglasDinamicas from './dinamico.js';
import * as reglasTecnm from './tecnm_art80.js';

/**
 * Retorna el motor de reglas de asistencia de acuerdo a la configuración de la empresa.
 * @param {string} motorNombre - Nombre del motor configurado en la DB ('dinamico', 'tecnm_art80')
 * @returns {Object} Objeto con las funciones de evaluación y equivalencias
 */
export const getMotorReglas = (motorNombre) => {
    switch (motorNombre) {
        case 'tecnm_art80':
            return reglasTecnm;
        case 'dinamico':
        default:
            return reglasDinamicas;
    }
};

/**
 * Obtiene de la base de datos el nombre del motor configurado para una empresa dada.
 * Si no especifica, retorna 'dinamico'.
 * @param {string} empresaId 
 * @returns {Promise<string>}
 */
export const getMotorConfigurado = async (empresaId) => {
    try {
        const res = await pool.query(
            "SELECT motor_asistencias FROM empresas WHERE id = $1 LIMIT 1",
            [empresaId]
        );
        return res.rows[0]?.motor_asistencias || 'dinamico';
    } catch (err) {
        console.error('Error al obtener motor de asistencias:', err);
        return 'dinamico';
    }
};
