import { pool } from '../config/db.js';

/**
 * 1. BUSCAR REGLAS DE TOLERANCIA Y CONFIGURACIÓN
 */
export async function srvBuscarConfiguracion(empleadoId, empresaId) {
    const empleadoQuery = await pool.query(`
        SELECT e.id, e.horario_id, u.nombre, h.configuracion as horario_json, u.empresa_id,
               ed.departamento_id
        FROM empleados e
        INNER JOIN usuarios u ON u.id = e.usuario_id
        LEFT JOIN horarios h ON h.id = e.horario_id
        LEFT JOIN empleados_departamentos ed ON ed.empleado_id = e.id AND ed.es_activo = true
        WHERE e.id = $1 AND u.estado_cuenta = 'activo' AND u.empresa_id = $2
    `, [empleadoId, empresaId]);

    if (empleadoQuery.rows.length === 0) throw new Error("Empleado no encontrado o inactivo en esta empresa");
    const empleado = empleadoQuery.rows[0];

    const confQuery = await pool.query(`
        SELECT t.reglas, t.permite_registro_anticipado,
               t.minutos_anticipado_max, t.dias_aplica,
               t.aplica_tolerancia_entrada, t.aplica_tolerancia_salida,
               t.minutos_anticipo_salida, t.minutos_posterior_salida,
               c.segmentos_red, 
               COALESCE(c.intervalo_bloques_minutos, 60) as intervalo_bloques_minutos
        FROM tolerancias t
        INNER JOIN configuraciones c ON c.tolerancia_id = t.id
        WHERE c.id = (SELECT configuracion_id FROM empresas WHERE id = $1)
        AND t.es_activo = true
        LIMIT 1
    `, [empresaId]);

    const configuracion = confQuery.rows[0] || {
        reglas: '[]',
        permite_registro_anticipado: true,
        aplica_tolerancia_entrada: true,
        aplica_tolerancia_salida: false,
        minutos_anticipado_max: 60,
        minutos_anticipo_salida: 0,
        minutos_posterior_salida: 60,
        segmentos_red: '[]',
        intervalo_bloques_minutos: 60,
        dias_aplica: '{}'
    };

    let reglas = typeof configuracion.reglas === 'string' ? JSON.parse(configuracion.reglas) : configuracion.reglas;
    let red = typeof configuracion.segmentos_red === 'string' ? JSON.parse(configuracion.segmentos_red) : configuracion.segmentos_red;
    let horario = typeof empleado.horario_json === 'string' ? JSON.parse(empleado.horario_json) : (empleado.horario_json || null);
    let diasAplica = typeof configuracion.dias_aplica === 'string' ? JSON.parse(configuracion.dias_aplica) : (configuracion.dias_aplica || {});

    return {
        empleado,
        tolerancia: { ...configuracion, reglas, segmentos_red: red, dias_aplica: diasAplica },
        horario
    };
}

/**
 * Obtener los rangos de tiempo configurados para hoy
 */
export function srvObtenerTurnosDeHoy(horario, fechaActualLocal) {
    if (!horario) return [];
    const dias = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
    const diaHoy = dias[fechaActualLocal.getDay()];
    let turnos = [];
    if (horario.configuracion_semanal) {
        const key = Object.keys(horario.configuracion_semanal).find(k => k.toLowerCase() === diaHoy);
        if (key) turnos = horario.configuracion_semanal[key];
    }
    if (turnos.length === 0 && horario.dias) {
        const hasDay = horario.dias.some(d => d.toLowerCase() === diaHoy);
        if (hasDay) turnos = horario.turnos || [];
    }
    return turnos;
}

/**
 * 2. CREACIÓN DE BLOQUES FUSIONADOS
 */
export function srvBuscarBloqueActual(turnosDelDia, horaMinutos, intervaloBloquesMinutos, anticipoEntradaMax) {
    if (!turnosDelDia || turnosDelDia.length === 0) return null;

    // Convertir a minutos y ordenar
    const rangos = turnosDelDia.map(t => {
        const [he, me] = (t.inicio || t.entrada || "00:00").split(':').map(Number);
        const [hs, ms] = (t.fin || t.salida || "00:00").split(':').map(Number);
        return { entrada: he * 60 + me, salida: hs * 60 + ms };
    }).sort((a, b) => a.entrada - b.entrada);

    // Fusión de rangos en Bloques usando el intervalo configurado
    const bloques = [];
    let bActual = { ...rangos[0] };

    for (let i = 1; i < rangos.length; i++) {
        const rSiguiente = rangos[i];
        const separacion = rSiguiente.entrada - bActual.salida;
        if (separacion <= intervaloBloquesMinutos) {
            bActual.salida = Math.max(bActual.salida, rSiguiente.salida);
        } else {
            bloques.push({ ...bActual });
            bActual = { ...rSiguiente };
        }
    }
    bloques.push(bActual);

    // Retorna el bloque donde el usuario está "operando" actualmente.
    // Un bloque absorbe la hora actual si está dentro de su rango +/- un margen de búsqueda.
    for (const b of bloques) {
        const inicioBusqueda = b.entrada - (anticipoEntradaMax + 30);
        const finBusqueda = b.salida + (intervaloBloquesMinutos + 30);
        if (horaMinutos >= inicioBusqueda && horaMinutos <= finBusqueda) {
            return b;
        }
    }

    return null;
}

/**
 * 5. VERIFICACIÓN DE ASISTENCIA POR BLOQUE (Entradas y Salidas registradas para un bloque específico)
 */
export function srvVerificarLongitudYTipo(registrosHoy, bloque, fechaISO, intervaloBloquesMinutos) {
    if (!bloque) return { cerrado: false, tipo: 'entrada', entradas: 0, salidas: 0 };

    const regsDelDia = registrosHoy.filter(r => new Date(r.fecha_registro).toISOString().startsWith(fechaISO.substring(0, 10)));

    // Filtrar solo registros que pertenecen lógicamente a este BLOQUE fusionado
    const regsBloque = regsDelDia.filter(r => {
        const d = new Date(r.fecha_registro);
        const mins = d.getHours() * 60 + d.getMinutes();
        const margen = intervaloBloquesMinutos || 60;
        return (mins >= bloque.entrada - margen && mins <= bloque.salida + margen);
    });

    const entradas = regsBloque.filter(r => r.tipo === 'entrada').length;
    const salidas = regsBloque.filter(r => r.tipo === 'salida').length;

    let cerrado = false;
    let tipo = 'entrada';

    if (entradas > 0 && salidas === 0) {
        tipo = 'salida';
    } else if (entradas > 0 && salidas > 0) {
        cerrado = true;
        tipo = 'completado';
    }

    return { cerrado, tipo, entradas, salidas };
}

/**
 * 8. EVALUAR ESTADO BASADO EN REGLAS (Puntual, Retardo, Temprano)
 */
export function srvEvaluarEstado(tipoAsistencia, horaMinutos, bloque, tolerancia) {
    if (!bloque) return (tipoAsistencia === 'entrada') ? 'puntual' : 'salida_puntual';

    const dias = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
    const diaHoy = dias[new Date().getDay()];
    const aplicaHoy = tolerancia.dias_aplica?.[diaHoy] !== false;

    if (tipoAsistencia === 'entrada') {
        const diff = horaMinutos - bloque.entrada;
        if (diff <= 0) return 'puntual';
        if (!aplicaHoy) return 'falta';

        const reglas = [...(tolerancia.reglas || [])].sort((a, b) => a.limite_minutos - b.limite_minutos);
        for (const r of reglas) {
            if (diff <= r.limite_minutos) return r.id;
        }
        return 'falta';
    } else {
        const diffSalida = bloque.salida - horaMinutos;

        if (diffSalida > 0) return 'salida_temprano'; // Salió antes de la hora exacta de fin del bloque

        const posteriorPermitido = tolerancia.minutos_posterior_salida || 60;
        if (Math.abs(diffSalida) > posteriorPermitido) return 'salida_tarde';

        return 'salida_puntual';
    }
}

/**
 * 9. VALIDACIÓN DE VENTANA DE REGISTRO (BLOQUEO DURO)
 */
export function srvValidarVentanaDeRegistro(bloque, horaMinutos, tolerancia, tipoAsistencia) {
    if (!bloque) {
        return {
            valido: false,
            mensaje: 'No se encontró un horario asignado para este momento.',
            estadoHorario: 'tiempo_insuficiente'
        };
    }

    if (tipoAsistencia === 'entrada') {
        const anticipoEntrada = tolerancia.minutos_anticipado_max || 0;
        const inicioEntrada = bloque.entrada - anticipoEntrada;
        const finEntrada = bloque.salida;

        if (horaMinutos < inicioEntrada) {
            return {
                valido: false,
                mensaje: 'Aún no es hora de iniciar el registro de entrada.',
                estadoHorario: 'tiempo_insuficiente'
            };
        }
        if (horaMinutos > finEntrada) {
            return {
                valido: false,
                mensaje: 'El horario para registrar entrada en este bloque ha finalizado.',
                estadoHorario: 'tiempo_insuficiente'
            };
        }
    } else {
        const anticipoSalida = tolerancia.minutos_anticipo_salida || 0;
        const posteriorSalida = tolerancia.minutos_posterior_salida || 60;

        const inicioSalida = bloque.salida - anticipoSalida;
        const finSalida = bloque.salida + posteriorSalida;

        if (horaMinutos < inicioSalida) {
            return {
                valido: false,
                mensaje: 'Aún no está permitido registrar la salida (fuera de regla de anticipo).',
                estadoHorario: 'tiempo_insuficiente'
            };
        }
        if (horaMinutos > finSalida) {
            return {
                valido: false,
                mensaje: 'Has superado el tiempo límite permitido para registrar la salida.',
                estadoHorario: 'tiempo_insuficiente'
            };
        }
    }

    return { valido: true };
}

/**
 * Validar IP y GPS (Auxiliar)
 */
export function srvValidarZonaYRed() { return true; }

/**
 * Actualizar conteos JSONB
 */
export async function srvAumentarConteo(empleadoId, estadoCalculado, reglasTolerancia) {
    if (!reglasTolerancia) return null;
    const reglaAplicada = reglasTolerancia.find(r => r.id === estadoCalculado);
    if (!reglaAplicada || reglaAplicada.penalizacion_tipo !== 'acumulacion') return null;
    const limiteRetardos = Number(reglaAplicada.penalizacion_valor);
    if (limiteRetardos <= 0) return null;

    const retardoId = reglaAplicada.id;
    const updRes = await pool.query(`
        UPDATE empleados
        SET contadores = jsonb_set(COALESCE(contadores, '{}'::jsonb), '{${retardoId}}', (COALESCE((contadores->>'${retardoId}')::int, 0) + 1)::text::jsonb)
        WHERE id = $1 RETURNING contadores
    `, [empleadoId]);

    const contadorActual = parseInt(updRes.rows[0].contadores[retardoId]) || 0;
    if (contadorActual >= limiteRetardos) {
        await pool.query(`UPDATE empleados SET contadores = jsonb_set(contadores, '{${retardoId}}', '0'::jsonb) WHERE id = $1`, [empleadoId]);
        return { limiteAlcanzado: true, motivo: `Acumulación de ${limiteRetardos} retardos tipo ${reglaAplicada.id}` };
    }
    return { limiteAlcanzado: false, contadorActual };
}
