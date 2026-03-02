import { pool } from '../config/db.js';

// ── 1. BUSCAR REGLAS DE TOLERANCIA Y CONFIGURACIÓN ──
// Busca la configuración de la empresa del empleado, ignorando el "rol",
// y recuperando tolerancias, y las reglas globales (segmentos red, distancias, etc).
export async function buscarConfiguracionTolerancia(empleadoId) {
    const empleadoQuery = await pool.query(`
        SELECT e.id, e.horario_id, u.nombre, h.configuracion as horario_json, u.empresa_id, e.departamento_id
        FROM empleados e
        INNER JOIN usuarios u ON u.id = e.usuario_id
        LEFT JOIN horarios h ON h.id = e.horario_id
        WHERE e.id = $1 AND u.estado_cuenta = 'activo'
    `, [empleadoId]);

    if (empleadoQuery.rows.length === 0) throw new Error("Empleado no encontrado o inactivo");
    const empleado = empleadoQuery.rows[0];

    const confQuery = await pool.query(`
        SELECT t.reglas, t.permite_registro_anticipado,
               t.minutos_anticipado_max,
               c.segmentos_red, 
               COALESCE(c.intervalo_bloques_minutos, 60) as intervalo_bloques_minutos
        FROM tolerancias t
        INNER JOIN configuraciones c ON c.tolerancia_id = t.id
        INNER JOIN empresas emp ON emp.configuracion_id = c.id
        WHERE emp.id = $1 AND t.es_activo = true
        LIMIT 1
    `, [empleado.empresa_id]);

    const configuracion = confQuery.rows[0] || {
        reglas: '[]',
        permite_registro_anticipado: true,
        minutos_anticipado_max: 60,
        segmentos_red: '[]',
        intervalo_bloques_minutos: 60
    };

    // Parse values
    let reglas = typeof configuracion.reglas === 'string' ? JSON.parse(configuracion.reglas) : configuracion.reglas;
    let red = typeof configuracion.segmentos_red === 'string' ? JSON.parse(configuracion.segmentos_red) : configuracion.segmentos_red;
    let horario = typeof empleado.horario_json === 'string' ? JSON.parse(empleado.horario_json) : empleado.horario_json;

    return {
        empleado,
        tolerancia: {
            ...configuracion,
            reglas,
            segmentos_red: red
        },
        horario
    };
}

// ── 2. AGRUPAR TURNOS EN BLOQUES COMPUESTOS ──
// Considera turnos secuenciales que estén separados por menos de "intervalo_bloques"
export function agruparBloquesCompuestos(turnosDelDia, intervaloBloquesMinutos) {
    if (!turnosDelDia || turnosDelDia.length === 0) return [];

    // Convertir todo a minutos para manejar fácilmente
    const turnosEnMinutos = turnosDelDia.map(t => {
        const [he, me] = t.inicio ? t.inicio.split(':').map(Number) : t.entrada.split(':').map(Number);
        const [hs, ms] = t.fin ? t.fin.split(':').map(Number) : t.salida.split(':').map(Number);
        return {
            entrada: he * 60 + me,
            salida: hs * 60 + ms,
            strEntrada: t.inicio || t.entrada,
            strSalida: t.fin || t.salida
        };
    }).sort((a, b) => a.entrada - b.entrada);

    const bloques = [];
    let bActual = {
        inicioMin: turnosEnMinutos[0].entrada,
        finMin: turnosEnMinutos[0].salida,
        strEntrada: turnosEnMinutos[0].strEntrada,
        strSalida: turnosEnMinutos[0].strSalida,
        turnosOriginales: [turnosEnMinutos[0]]
    };

    for (let i = 1; i < turnosEnMinutos.length; i++) {
        const tSiguiente = turnosEnMinutos[i];
        const separacion = tSiguiente.entrada - bActual.finMin;

        if (separacion <= intervaloBloquesMinutos) {
            // Se fusionan
            bActual.finMin = Math.max(bActual.finMin, tSiguiente.salida);
            bActual.strSalida = tSiguiente.strSalida; // actualiza hora texto
            bActual.turnosOriginales.push(tSiguiente);
        } else {
            // Termina el bloque anterior
            bloques.push(bActual);
            // Inicia nuevo
            bActual = {
                inicioMin: tSiguiente.entrada,
                finMin: tSiguiente.salida,
                strEntrada: tSiguiente.strEntrada,
                strSalida: tSiguiente.strSalida,
                turnosOriginales: [tSiguiente]
            };
        }
    }
    bloques.push(bActual);
    return bloques;
}

// ── 3. VISUAL / IDENTIFICAR BLOQUE ACTUAL ──
export function identificarBloque(bloques, horaActualMinutos, minutosAnticipoMax) {
    // Buscar el bloque que corresponda a la hora actual o el próximo
    let bloqueAsignado = null;
    let visualDentroDeTurno = false;

    for (let b of bloques) {
        let inicioPermitido = b.inicioMin - (minutosAnticipoMax || 60);
        let finPermitido = b.finMin + 120; // digamos 2 horas de límite superior para salida

        // Está estrictamente en el horario "dentro"
        if (horaActualMinutos >= b.inicioMin && horaActualMinutos <= b.finMin) {
            visualDentroDeTurno = true;
            bloqueAsignado = b;
            break;
        }

        // Está en la ventana permitida (anticipado o tardía)
        if (horaActualMinutos >= inicioPermitido && horaActualMinutos <= finPermitido) {
            bloqueAsignado = b;
            break;
        }
    }

    // Si la hora es anterior al primer bloque del día, asignamos al primer bloque
    if (!bloqueAsignado && bloques.length > 0) {
        if (horaActualMinutos < bloques[0].inicioMin) {
            bloqueAsignado = bloques[0];
        } else {
            // Ya pasaron todos los bloques, asignar el último quizás
            bloqueAsignado = bloques[bloques.length - 1];
        }
    }

    return { bloqueActual: bloqueAsignado, visualDentroDeTurno };
}

// ── 4. ANALIZAR REGISTROS DEL BLOQUE (ENTRADA VS SALIDA) ──
export function analizarEstadoAsistencia(registrosHoy, bloqueActual, fechaLocalStr) {
    if (!bloqueActual) return { tipoSugerido: 'entrada', faltantes: 2 };

    // Filtrar los registros del empleado correspondientes al inicio/fin del bloque.
    // Una manera segura es buscar 'entrada' y 'salida' que estén correlacionadas con este bloque.
    // Ya que no tenemos IDs de bloque guardados, usamos cercanía a las horas del bloque.

    // Pero lo más simple es contar las entradas/salidas cronológicamente para el día:
    const regsDelDia = registrosHoy.filter(r => r.fecha_registro.toISOString().startsWith(fechaLocalStr));

    // Determinar a qué bloque pertenece cada registro para saber si el bloque actual está cerrado:
    let regsDelBloqueActual = regsDelDia.filter(r => {
        const dt = new Date(r.fecha_registro);
        const mins = dt.getHours() * 60 + dt.getMinutes();
        // Pertenece si está dentro de un margen muy amplio sobre el bloque.
        // Pero en lugar de calcular por hora, si asumimos orden cronológico, 
        // 0 registros = entra, 1 = sale, 2 = cerrado.
        // Vamos a ser estrictos y solo contar los ligados al bloque por proximidad.
        const inicioPermitido = bloqueActual.inicioMin - 120; // 2 horas antes
        const finPermitido = bloqueActual.finMin + 120; // 2 horas despues
        return (mins >= inicioPermitido && mins <= finPermitido);
    });

    const entradas = regsDelBloqueActual.filter(r => r.tipo === 'entrada').length;
    const salidas = regsDelBloqueActual.filter(r => r.tipo === 'salida').length;

    let tipoSugerido = 'entrada';
    if (entradas === 0) tipoSugerido = 'entrada';
    else if (entradas > 0 && salidas === 0) tipoSugerido = 'salida';
    else tipoSugerido = 'completado'; // Ya cerró este bloque

    return { tipoSugerido, entradas, salidas };
}

// ── 5. VALIDAR DENTRO DE HORARIO Y TOLERANCIA ──
export function evaluarTolerancia(tipoSugerido, horaActualMinutos, bloqueActual, tolerancia) {
    if (tipoSugerido === 'entrada') {
        const retardoMins = horaActualMinutos - bloqueActual.inicioMin;

        // Llegó antes de tiempo o justo
        if (retardoMins <= 0) return 'puntual';

        // Ordenar reglas por límite para evaluar
        let reglas = [...tolerancia.reglas].sort((a, b) => a.limite_minutos - b.limite_minutos);
        for (let r of reglas) {
            if (retardoMins <= r.limite_minutos) {
                return r.id; // ej. retardo_a, retardo_b o falta_directa
            }
        }
        return 'falta'; // fallback
    } else {
        // Es salida
        const minSalida = bloqueActual.finMin;
        const faltanMinsParaSalida = minSalida - horaActualMinutos;

        // Si sale antes de hora, es salida_temprano. 
        // Si sale después, es salida_puntual
        if (faltanMinsParaSalida > 0) return 'salida_temprano';
        return 'salida_puntual';
    }
}
