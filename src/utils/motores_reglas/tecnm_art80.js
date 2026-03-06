import { pool } from '../../config/db.js';

/**
 * Motor Estricto TECNM (Reglamento Art. 80)
 * Evalúa las equivalencias con la contabilidad estricta de notas malas, amonestaciones y suspensiones.
 */

export const calcularEquivalencias = async (empleadoId, empresa_id, inicio, fin) => {
    // 1. Obtener conteo de los registros
    const statsRes = await pool.query(`
        SELECT
            COUNT(*) FILTER (WHERE estado = 'retardo_a') AS retardos_a,
            COUNT(*) FILTER (WHERE estado = 'retardo_b') AS retardos_b,
            COUNT(*) FILTER (WHERE estado IN ('falta', 'falta_por_retardo') AND dispositivo_origen != 'sistema') AS faltas_directas,
            COUNT(*) FILTER (WHERE estado IN ('falta', 'falta_por_retardo') AND dispositivo_origen = 'sistema') AS faltas_por_acumulacion
        FROM asistencias
        WHERE empleado_id = $1
          AND tipo = 'entrada'
          AND fecha_registro::date BETWEEN $2 AND $3
    `, [empleadoId, inicio, fin]);

    const s = statsRes.rows[0];
    const retA = parseInt(s.retardos_a) || 0;
    const retB = parseInt(s.retardos_b) || 0;
    const faltasDirectas = parseInt(s.faltas_directas) || 0;

    // 2. Lógica Art 80. TECNM
    // Inciso A y B: 2 Retardos A = 1 Nota Mala. 1 Retardo B = 1 Nota Mala
    const notasMalas = Math.floor(retA / 2) + retB;

    // Inciso D: 5 notas malas = 1 día de suspensión
    const suspensionesPorNotasMalas = Math.floor(notasMalas / 5);

    // En TECNM no se usan "Faltas Equivalentes" por Retardos. Los castigos son Suspensiones y Amonestaciones.
    // Sin embargo, para mantener el tipo de retorno compatible con el Frontend:
    const faltasTotal = faltasDirectas + (parseInt(s.faltas_por_acumulacion) || 0);

    return {
        retardos_a: retA,
        retardos_b: retB,
        faltas_directas: faltasDirectas,
        faltas_por_acumulacion_sistema: parseInt(s.faltas_por_acumulacion) || 0,
        faltas_equivalentes_por_retardos: 0, // TECNM no usa este concepto
        faltas_totales: faltasTotal,
        notas_malas_acumuladas: notasMalas,
        suspensiones_generadas: suspensionesPorNotasMalas, // Nuevo valor para frontend
        configuracion_equivalencias: {
            retardos_a_por_falta: 10, // Placeholder UI
            retardos_b_por_falta: 5,  // Placeholder UI
            art_80a_retardos_a_por_nota: 2,
            art_80b_retardos_b_por_nota: 1,
            notas_malas_para_suspension: 5
        },
        desglose_equivalencias: {
            faltas_por_retardos_a: 0,
            retardos_a_restantes: retA % 2, // Lo que sobra que aún no se hace nota mala
            faltas_por_retardos_b: 0,
            retardos_b_restantes: retB % 1  // Siempre 0 porque todos valen 1 nota
        }
    };
};
