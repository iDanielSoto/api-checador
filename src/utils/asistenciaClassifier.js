/**
 * asistenciaClassifier.js
 * 
 * Función pura de clasificación de asistencia según el Reglamento de RRHH.
 * 
 * Zonas (basadas en minutos tarde respecto a la hora de entrada del horario):
 *  - puntual      : 0 – minutos_retardo (tolerancia del puesto)
 *  - retardo_a    : (tolerancia+1) – minutos_retardo_a_max
 *  - retardo_b    : (retardo_a_max+1) – minutos_retardo_b_max
 *  - falta        : > minutos_retardo_b_max  (equivalente Art. 80c: > 30 min = falta)
 *
 * Todos los umbrales son configurables en la tabla `tolerancias` de cada empresa.
 */

/**
 * Calcula cuántos minutos tarde llegó un empleado respecto a su horario.
 * 
 * @param {Date|string} horaChecada  Hora real de checada
 * @param {Date|string} horaHorario  Hora programada de entrada
 * @returns {number} Minutos tarde (negativo = llegó antes)
 */
export function calcularMinutosTarde(horaChecada, horaHorario) {
    const checada = new Date(horaChecada);
    const horario = new Date(horaHorario);
    return Math.round((checada - horario) / 60000);
}

/**
 * Clasifica la asistencia de entrada según la tolerancia configurada.
 *
 * @param {number} minutosTarde - Minutos de diferencia (puede ser negativo si llegó antes)
 * @param {object} tolerancia   - Fila de la tabla tolerancias
 * @param {number} tolerancia.minutos_retardo       - Tolerancia base del puesto (ej. 10)
 * @param {number} tolerancia.minutos_retardo_a_max - Límite superior Retardo A (ej. 20)
 * @param {number} tolerancia.minutos_retardo_b_max - Límite superior Retardo B (ej. 29)
 * @param {number} tolerancia.minutos_falta         - Desde aquí es falta (ej. 30)
 * @returns {'puntual'|'retardo_a'|'retardo_b'|'falta'}
 */
export function clasificarMinutos(minutosTarde, tolerancia) {
    const {
        minutos_retardo = 10,
        minutos_retardo_a_max = 20,
        minutos_retardo_b_max = 29,
        minutos_falta = 30
    } = tolerancia;

    if (minutosTarde <= minutos_retardo) return 'puntual';
    if (minutosTarde <= minutos_retardo_a_max) return 'retardo_a';
    if (minutosTarde <= minutos_retardo_b_max) return 'retardo_b';
    return 'falta'; // >= minutos_falta (Art. 80c)
}

/**
 * Clasifica una asistencia de entrada directamente con fechas.
 * 
 * @param {Date|string} horaChecada
 * @param {Date|string} horaHorario
 * @param {object}      tolerancia
 * @returns {'puntual'|'retardo_a'|'retardo_b'|'falta'}
 */
export function clasificarAsistencia(horaChecada, horaHorario, tolerancia) {
    const minutosTarde = calcularMinutosTarde(horaChecada, horaHorario);
    return clasificarMinutos(minutosTarde, tolerancia);
}

/**
 * Calcula faltas equivalentes acumuladas a partir de conteos de retardos.
 * 
 * Reglas del reglamento TecNM:
 *  - 10 Retardo A = 1 falta
 *  -  5 Retardo B = 1 falta
 * 
 * @param {number} totalRetardosA
 * @param {number} totalRetardosB
 * @param {object} tolerancia
 * @param {number} tolerancia.equivalencia_retardo_a  (default 10)
 * @param {number} tolerancia.equivalencia_retardo_b  (default 5)
 * @returns {{ faltasEquivalentes: number, retardosARestantes: number, retardosBRestantes: number }}
 */
export function calcularEquivalencias(totalRetardosA, totalRetardosB, tolerancia = {}) {
    const eqA = tolerancia.equivalencia_retardo_a ?? 10;
    const eqB = tolerancia.equivalencia_retardo_b ?? 5;

    const faltasPorA = Math.floor(totalRetardosA / eqA);
    const faltasPorB = Math.floor(totalRetardosB / eqB);

    return {
        faltasEquivalentes: faltasPorA + faltasPorB,
        retardosARestantes: totalRetardosA % eqA,
        retardosBRestantes: totalRetardosB % eqB,
        desglose: {
            retardos_a: totalRetardosA,
            retardos_b: totalRetardosB,
            faltas_por_a: faltasPorA,
            faltas_por_b: faltasPorB,
        }
    };
}

/**
 * Calcula notas malas acumuladas en el período según Art. 80 del Reglamento.
 * 
 * - Art. 80a: 1 nota mala c/ 2 Retardo A en el mes
 * - Art. 80b: 1 nota mala por cada Retardo B
 * 
 * @param {number} totalRetardosA
 * @param {number} totalRetardosB
 * @returns {number} Notas malas acumuladas
 */
export function calcularNotasMalas(totalRetardosA, totalRetardosB) {
    const notasPorA = Math.floor(totalRetardosA / 2); // 1 nota c/2 Retardo A (Art. 80a)
    const notasPorB = totalRetardosB;                  // 1 nota por Retardo B   (Art. 80b)
    return notasPorA + notasPorB;
}

/**
 * Valida que un arreglo de reglas de tolerancia no tenga choques lógicos.
 * 
 * Verifica:
 * 1. Que no haya límites de minutos duplicados.
 * 2. Que no haya estados (IDs) duplicados.
 * 3. Congruencia de severidad (no puede haber un estado más leve a los 30 min que el que había a los 10 min).
 * 
 * @param {Array} reglas Arreglo de reglas [{id: '...', limite_minutos: ...}]
 * @returns {{ valido: boolean, mensaje?: string }}
 */
export function validarReglasTolerancia(reglas) {
    if (!reglas || !Array.isArray(reglas) || reglas.length === 0) return { valido: true };

    // Definir jerarquía de severidad (mayor peso = peor consecuencia)
    const jerarquia = {
        'puntual': 0,
        'retardo_a': 1,
        'retardo_b': 2,
        'retardo_c': 3,
        'falta': 4,
        'falta_por_retardo': 5,
        'falta_directa': 6,
        'falta_automatica': 7
    };

    // Ordenamos una copia temporal
    const reglasOrdenadas = [...reglas].sort((a, b) => a.limite_minutos - b.limite_minutos);

    let maxJerarquiaActual = -1;
    let minutosVistos = new Set();
    let idsVistos = new Set();

    for (let i = 0; i < reglasOrdenadas.length; i++) {
        const regla = reglasOrdenadas[i];

        // 1. Validar que no haya minutos duplicados
        if (minutosVistos.has(regla.limite_minutos)) {
            return { valido: false, mensaje: `Conflicto de tiempo: Múltiples reglas definidas para los ${regla.limite_minutos} minutos.` };
        }
        minutosVistos.add(regla.limite_minutos);

        // 2. Validar que no haya estados duplicados
        if (idsVistos.has(regla.id)) {
            return { valido: false, mensaje: `Estado duplicado: Solo puede haber una regla para el estado '${regla.id}'.` };
        }
        idsVistos.add(regla.id);

        // 3. Validar choque de severidad (congruencia lógica)
        const pesoActual = jerarquia[regla.id] !== undefined ? jerarquia[regla.id] : 0;

        if (pesoActual < maxJerarquiaActual) {
            return {
                valido: false,
                mensaje: `Choque lógico: A los ${regla.limite_minutos} minutos se asigna '${regla.id}' después de tener un estado más severo en menos minutos.`
            };
        }

        maxJerarquiaActual = pesoActual;
    }

    return { valido: true };
}
