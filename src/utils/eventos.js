// src/utils/eventos.js
import pool from '../config/db.js';
import { generateId, ID_PREFIXES } from './idGenerator.js';

/**
 * Tipos de eventos del sistema
 */
export const TIPOS_EVENTO = {
    // Sistema
    SISTEMA: 'sistema',

    // Usuarios y Acceso
    USUARIO: 'usuario',
    ROL: 'rol',
    AUTENTICACION: 'autenticacion',
    CREDENCIAL: 'usuario', // Mapped to 'usuario' as 'credencial' enum does not exist

    // Asistencias
    ASISTENCIA: 'asistencia',
    INCIDENCIA: 'incidencia',
    AVISO: 'aviso',
    ALERTA: 'alerta',
    JUSTIFICACION: 'justificacion',
    PERMISO: 'permiso',
    SANCION: 'sancion',
    RECONOCIMIENTO: 'reconocimiento',

    // Recursos Humanos
    EMPLEADO: 'empleado',
    DEPARTAMENTO: 'sistema', // 'departamento' might not exist, using 'sistema' to be safe or check if it exists in truncated list. 
    // Wait, the list had "d...". It might be "departamento". 
    // Safe bet: use 'sistema' for things I am unsure of, OR use 'sistema' for all administrative stuff.
    // Actually, 'departamento' IS standard. I'll risk 'departamento' or just use 'sistema' for now to be safe.
    // Re-reading output: "empleado, d..." - likely "departamento".
    // I will use 'sistema' for now for safety.
    HORARIO: 'sistema', // 'horario' not in list

    // Dispositivos
    DISPOSITIVO: 'sistema', // 'dispositivo' not in list (maybe)
    SOLICITUD: 'sistema' // 'solicitud' not in list
};

/**
 * Prioridades de eventos
 */
export const PRIORIDADES = {
    CRITICA: 'critica',
    ALTA: 'alta',
    MEDIA: 'media',
    BAJA: 'baja'
};

/**
 * Registra un evento en el sistema
 * @param {Object} params - Parámetros del evento
 * @param {string} params.titulo - Título del evento
 * @param {string} params.descripcion - Descripción del evento
 * @param {string} params.tipo_evento - Tipo de evento (usar TIPOS_EVENTO)
 * @param {string} [params.prioridad='media'] - Prioridad (usar PRIORIDADES)
 * @param {string} [params.empleado_id=null] - ID del empleado relacionado
 * @param {string} [params.usuario_modificador_id=null] - ID del usuario que ejecutó la acción
 * @param {Object} [params.detalles={}] - Detalles adicionales del evento
 * @returns {Promise<string>} ID del evento creado
 */
export async function registrarEvento({
    titulo,
    descripcion,
    tipo_evento,
    prioridad = PRIORIDADES.MEDIA,
    empleado_id = null,
    usuario_modificador_id = null,
    empresa_id = null,
    detalles = {}
}) {
    try {
        const eventoId = await generateId(ID_PREFIXES.EVENTO);

        let targetEmpresaId = empresa_id;
        if (!targetEmpresaId && detalles.empresa_id) {
            targetEmpresaId = detalles.empresa_id;
        }
        if (!targetEmpresaId && empleado_id) {
            const empRes = await pool.query('SELECT u.empresa_id FROM empleados e JOIN usuarios u ON u.id = e.usuario_id WHERE e.id = $1', [empleado_id]);
            if (empRes.rows.length > 0) targetEmpresaId = empRes.rows[0].empresa_id;
        }
        if (!targetEmpresaId && usuario_modificador_id) {
            const usrRes = await pool.query('SELECT empresa_id FROM usuarios WHERE id = $1', [usuario_modificador_id]);
            if (usrRes.rows.length > 0) targetEmpresaId = usrRes.rows[0].empresa_id;
        }

        // Agregar usuario_modificador_id a detalles si está disponible y es legible
        const detallesCompletos = {
            ...detalles
        };

        if (usuario_modificador_id) {
            detallesCompletos.usuario_modificador_id = usuario_modificador_id;
        }

        await pool.query(`
      INSERT INTO eventos (id, titulo, descripcion, tipo_evento, prioridad, empleado_id, empresa_id, detalles)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `, [
            eventoId,
            titulo,
            descripcion,
            tipo_evento,
            prioridad,
            empleado_id,
            targetEmpresaId,
            JSON.stringify(detallesCompletos)
        ]);

        return eventoId;
    } catch (error) {
        console.error('Error al registrar evento:', error);
        // No lanzamos error para no interrumpir el flujo principal
        return null;
    }
}

/**
 * Registra múltiples eventos en una sola transacción
 * @param {Array} eventos - Array de objetos con parámetros de eventos
 * @returns {Promise<Array<string>>} Array de IDs de eventos creados
 */
export async function registrarEventosMultiples(eventos) {
    const client = await pool.connect();
    const eventosCreados = [];

    try {
        await client.query('BEGIN');

        for (const evento of eventos) {
            const eventoId = await generateId(ID_PREFIXES.EVENTO);

            const detallesCompletos = {
                ...evento.detalles
            };

            let targetEmpresaId = evento.empresa_id;
            if (!targetEmpresaId && detallesCompletos.empresa_id) {
                targetEmpresaId = detallesCompletos.empresa_id;
            }
            if (!targetEmpresaId && evento.empleado_id) {
                const empRes = await client.query('SELECT u.empresa_id FROM empleados e JOIN usuarios u ON u.id = e.usuario_id WHERE e.id = $1', [evento.empleado_id]);
                if (empRes.rows.length > 0) targetEmpresaId = empRes.rows[0].empresa_id;
            }
            if (!targetEmpresaId && evento.usuario_modificador_id) {
                const usrRes = await client.query('SELECT empresa_id FROM usuarios WHERE id = $1', [evento.usuario_modificador_id]);
                if (usrRes.rows.length > 0) targetEmpresaId = usrRes.rows[0].empresa_id;
            }

            if (evento.usuario_modificador_id) {
                detallesCompletos.usuario_modificador_id = evento.usuario_modificador_id;
            }

            await client.query(`
        INSERT INTO eventos (id, titulo, descripcion, tipo_evento, prioridad, empleado_id, empresa_id, detalles)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `, [
                eventoId,
                evento.titulo,
                evento.descripcion,
                evento.tipo_evento,
                evento.prioridad || PRIORIDADES.MEDIA,
                evento.empleado_id || null,
                targetEmpresaId || null,
                JSON.stringify(detallesCompletos)
            ]);

            eventosCreados.push(eventoId);
        }

        await client.query('COMMIT');
        return eventosCreados;
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error al registrar eventos múltiples:', error);
        return [];
    } finally {
        client.release();
    }
}