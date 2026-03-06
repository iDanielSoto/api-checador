import { pool } from '../../config/db.js';
import { srvBuscarConfiguracion } from '../../services/asistencias.service.js';

/**
 * Motor Dinámico de Asistencias (FASITLAC Original)
 * Lógica flexible basada en "Tolerancias" y contadores configurables por la empresa.
 */

// 1. Evaluar si es retardo A, retardo B o puntual al momento de hacer Check-In (A implementarse si se quiere separar del Asistencia Classifier)
// Por el momento, dejaremos esto vacío o importable y solo nos concentraremos en getEquivalencias

/**
 * Calcula faltas equivalentes por acumulación de Retardo A/B en un período.
 */
export const calcularEquivalencias = async (empleadoId, empresa_id, inicio, fin) => {
    let eqA = 10;
    let eqB = 5;

    if (empresa_id) {
        const { tolerancia } = await srvBuscarConfiguracion(empleadoId, empresa_id);
        eqA = tolerancia.reglas?.find(r => r.id === 'retardo_a')?.penalizacion_valor ?? 10;
        eqB = tolerancia.reglas?.find(r => r.id === 'retardo_b')?.penalizacion_valor ?? 5;
    }

    // Conteos del período
    const statsRes = await pool.query(`
        SELECT
            COUNT(*) FILTER (WHERE estado = 'retardo_a')                           AS retardos_a,
            COUNT(*) FILTER (WHERE estado = 'retardo_b')                           AS retardos_b,
            COUNT(*) FILTER (WHERE estado IN ('falta', 'falta_por_retardo')
                              AND dispositivo_origen != 'sistema')                 AS faltas_directas,
            COUNT(*) FILTER (WHERE estado IN ('falta', 'falta_por_retardo')
                              AND dispositivo_origen = 'sistema')                  AS faltas_por_acumulacion
        FROM asistencias
        WHERE empleado_id = $1
          AND tipo = 'entrada'
          AND fecha_registro::date BETWEEN $2 AND $3
    `, [empleadoId, inicio, fin]);

    const s = statsRes.rows[0];
    const retA = parseInt(s.retardos_a) || 0;
    const retB = parseInt(s.retardos_b) || 0;
    const faltasPorA = Math.floor(retA / eqA);
    const faltasPorB = Math.floor(retB / eqB);
    const faltasEquivalentes = faltasPorA + faltasPorB;
    const faltasDirectas = parseInt(s.faltas_directas) || 0;
    const faltasTotal = faltasDirectas + faltasEquivalentes + (parseInt(s.faltas_por_acumulacion) || 0);

    // Notas malas genéricas
    const notasMalas = Math.floor(retA / 2) + retB;

    return {
        retardos_a: retA,
        retardos_b: retB,
        faltas_directas: faltasDirectas,
        faltas_por_acumulacion_sistema: parseInt(s.faltas_por_acumulacion) || 0,
        faltas_equivalentes_por_retardos: faltasEquivalentes,
        faltas_totales: faltasTotal,
        notas_malas_acumuladas: notasMalas,
        configuracion_equivalencias: {
            retardos_a_por_falta: eqA,
            retardos_b_por_falta: eqB,
            art_80a_retardos_a_por_nota: 2,
            art_80b_retardos_b_por_nota: 1
        },
        desglose_equivalencias: {
            faltas_por_retardos_a: faltasPorA,
            retardos_a_restantes: retA % eqA,
            faltas_por_retardos_b: faltasPorB,
            retardos_b_restantes: retB % eqB
        }
    };
};
