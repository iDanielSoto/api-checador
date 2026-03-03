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
        minutos_anticipado_max: 60,
        minutos_anticipo_salida: 0,
        minutos_posterior_salida: 60,
        segmentos_red: '[]',
        intervalo_bloques_minutos: 60,
        dias_aplica: '{}'
    };

    let reglas = typeof configuracion.reglas === 'string' ? JSON.parse(configuracion.reglas) : configuracion.reglas;
    let red = typeof configuracion.segmentos_red === 'string' ? JSON.parse(configuracion.segmentos_red) : configuracion.segmentos_red;
    let horario = typeof empleado.horario_json === 'string' ? JSON.parse(empleado.horario_json) : null;
    let diasAplica = typeof configuracion.dias_aplica === 'string' ? JSON.parse(configuracion.dias_aplica) : (configuracion.dias_aplica || {});

    return {
        empleado,
        tolerancia: { ...configuracion, reglas, segmentos_red: red, dias_aplica: diasAplica },
        horario
    };
}

/**
 * Mapear el día actual a turnos (lunes, martes, etc.)
 */
export function srvObtenerTurnosDeHoy(horario, fechaActualLocal) {
    if (!horario) return [];
    const dias = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
    const diaHoy = dias[fechaActualLocal.getDay()];
    let turnos = [];
    if (horario.configuracion_semanal && horario.configuracion_semanal[diaHoy]) {
        turnos = horario.configuracion_semanal[diaHoy];
    } else if (horario.dias && horario.dias.includes(diaHoy)) {
        turnos = horario.turnos || [];
    }
    return turnos;
}

/**
 * 2. AGRUPAR BLOQUES COMPUESTOS Y 3. BUSCAR PRÓXIMO BLOQUE
 */
export function srvBuscarBloqueActual(turnosDelDia, horaMinutos, intervaloBloquesMinutos, anticipoMax) {
    if (!turnosDelDia || turnosDelDia.length === 0) return null;

    // Aplanar y convertir turnos a minutos
    const turnosEnMinutos = turnosDelDia.map(t => {
        const [he, me] = (t.inicio || t.entrada || "00:00").split(':').map(Number);
        const [hs, ms] = (t.fin || t.salida || "00:00").split(':').map(Number);
        return { entrada: he * 60 + me, salida: hs * 60 + ms, strEntrada: t.inicio || t.entrada, strSalida: t.fin || t.salida };
    }).sort((a, b) => a.entrada - b.entrada);

    // Agrupar
    const bloques = [];
    let bActual = { ...turnosEnMinutos[0] };

    for (let i = 1; i < turnosEnMinutos.length; i++) {
        const tSiguiente = turnosEnMinutos[i];
        const separacion = tSiguiente.entrada - bActual.salida;
        if (separacion <= intervaloBloquesMinutos) {
            bActual.salida = Math.max(bActual.salida, tSiguiente.salida);
            bActual.strSalida = tSiguiente.strSalida;
        } else {
            bloques.push({ ...bActual });
            bActual = { ...tSiguiente };
        }
    }
    bloques.push(bActual);

    // Buscar bloque activo
    // Se considera activo si está entre (inicio - anticipoMax) y (fin + x mins margen salida posterior)
    let margenSalidaPosterior = 240; // 4 horas para no fallar
    for (let b of bloques) {
        let inicioPermitido = b.entrada - anticipoMax;
        let finPermitido = b.salida + margenSalidaPosterior;

        if (horaMinutos >= inicioPermitido && horaMinutos <= finPermitido) {
            return b;
        }
    }

    // Si es más temprano que todos o más tarde, retorna el 1ro o último pa castigarlo
    if (horaMinutos < bloques[0].entrada) return bloques[0];
    return bloques[bloques.length - 1];
}

/**
 * 4. VALIDAR DENTRO DE TURNO (VISUAL)
 */
export function srvDentroDeTurnoVisual(bloque, horaMinutos) {
    if (!bloque) return false;
    return (horaMinutos >= bloque.entrada && horaMinutos <= bloque.salida);
}

/**
 * 5. VERIFICAR LONGITUD DE BLOQUE PARA CALCULAR ENTRADA/SALIDA Y SI ESTÁ CERRADO
 */
export function srvVerificarLongitudYTipo(registrosHoy, bloque, fechaISO) {
    if (!bloque) {
        // Fallback: Si no hay bloque/horario, validamos contra el último registro para evitar repetidos
        const regsCorregidos = [...registrosHoy].sort((a, b) => new Date(b.fecha_registro) - new Date(a.fecha_registro));
        const lastReg = regsCorregidos[0];

        let cerrado = false;
        let tipo = 'entrada';
        let entradas = 0;
        let salidas = 0;

        if (lastReg) {
            if (lastReg.tipo === 'entrada') {
                entradas = 1; tipo = 'salida';
            } else if (lastReg.tipo === 'salida') {
                salidas = 1; tipo = 'entrada';
            }
        }

        return { cerrado, tipo, entradas, salidas };
    }

    // Filtramos solo los registros del dia en el huso de la empresa.
    const regsDelDia = registrosHoy.filter(r => new Date(r.fecha_registro).toISOString().startsWith(fechaISO.substring(0, 10)));

    // Filtramos registros que encajen cerca de este bloque en particular
    // usando la hora de registro vs el bloque
    const regsBloque = regsDelDia.filter(r => {
        const d = new Date(r.fecha_registro);
        const mins = d.getHours() * 60 + d.getMinutes();
        // Permisividad de 4 horas antes/despues
        return (mins >= bloque.entrada - 240 && mins <= bloque.salida + 240);
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
 * 6. & 7. VALIDAR ZONA Y RED
 */
export function srvValidarZonaYRed(ubicacionEmpleado, zonasPermitidas, ipEmpleado, segmentosRed) {
    // Si necesitas bloquear, lanzas throw new Error().
    // Aquí podrías agregar librerías de IPs o geocerca, según necesites.
    console.log("[SRV] Validando zona:", ubicacionEmpleado, zonasPermitidas);
    console.log("[SRV] Validando segmento de red:", ipEmpleado, segmentosRed);
    // Para simplificar, suponemos que pasa si no hay lógicas complejas de IP importadas
    return true;
}

/**
 * 8. ASIGNAR CLASIFICACIÓN CONTRA REGLAS DE TOLERANCIA
 */
export function srvEvaluarEstado(tipoAsistencia, horaMinutos, bloque, tolerancia) {
    if (!bloque) return (tipoAsistencia === 'entrada') ? 'puntual' : 'salida_puntual'; // Sin horario

    // Verificamos si aplica tolerancia el día de hoy
    const dias = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
    const diaHoy = dias[new Date().getDay()];
    // default true si no hay dias_aplica especificados
    const aplicaHoy = tolerancia.dias_aplica?.[diaHoy] !== false;

    if (tipoAsistencia === 'entrada') {
        let llegadaAdelantadoOMinutosTarde = horaMinutos - bloque.entrada;
        // Si llegó antes o a tiempo, siempre es puntual
        if (llegadaAdelantadoOMinutosTarde <= 0) return 'puntual';

        // LLEGÓ TARDE (llegadaAdelantadoOMinutosTarde > 0):
        if (!aplicaHoy) {
            // Si HOY NO HAY tolerancias permitidas y llegó tarde, pero tiene reglas configuradas,
            // podemos considerarlo falta directamente o ignorarlo según requerimiento.
            // Para el caso general, si no hay tolerancia hoy, cualquier minuto tarde es falta.
            return 'falta';
        }

        // Sí hay tolerancia hoy. Vamos a buscar si los minutos tarde caen dentro de algún retardo
        let reglas = [...(tolerancia.reglas || [])].sort((a, b) => a.limite_minutos - b.limite_minutos);
        for (let r of reglas) {
            if (llegadaAdelantadoOMinutosTarde <= r.limite_minutos) {
                return r.id; // retornará retardo_a, retardo_b, etc.
            }
        }

        // Si superó TODOS los límites de retardo, es falta.
        return 'falta';
    } else {
        // EN SALIDA:
        let faltanMins = bloque.salida - horaMinutos;
        let anticipoPermitido = tolerancia.minutos_anticipo_salida || 0;
        let posteriorPermitido = tolerancia.minutos_posterior_salida || 60;

        // Tolerancia a la salida: si se sale antes de lo permitido
        if (faltanMins > anticipoPermitido) return 'salida_temprano';

        // Si pasaron demasiados minutos después de su salida permitida
        if (faltanMins < 0 && Math.abs(faltanMins) > posteriorPermitido) {
            return 'salida_tarde';
        }

        // Salió dentro del margen establecido
        return 'salida_puntual';
    }
}

/**
 * 9. ACTUALIZAR CONTEO JSONB SI ES RETARDO 
 */
export async function srvAumentarConteo(empleadoId, estadoCalculado, reglasTolerancia, resFaltaDirecta = null) {
    if (!reglasTolerancia) return null;

    const reglaAplicada = reglasTolerancia.find(r => r.id === estadoCalculado);
    if (!reglaAplicada || reglaAplicada.penalizacion_tipo !== 'acumulacion') return null;

    const limiteRetardos = Number(reglaAplicada.penalizacion_valor);
    if (limiteRetardos <= 0) return null;

    // Actualiza Postgres JSONB
    const retardoId = reglaAplicada.id;
    const updRes = await pool.query(`
        UPDATE empleados
        SET contadores = jsonb_set(
            COALESCE(contadores, '{}'::jsonb), 
            '{${retardoId}}', 
            (COALESCE((contadores->>'${retardoId}')::int, 0) + 1)::text::jsonb
        )
        WHERE id = $1
        RETURNING contadores
    `, [empleadoId]);

    const contadorActual = parseInt(updRes.rows[0].contadores[retardoId]) || 0;

    // Si supera el límite... se convierte en FALTA DIRECTA automáticamente. 
    // Esta función retornaria flag para que el controller cree 2do registro de Alta.
    if (contadorActual >= limiteRetardos) {
        // Reniciar el contador a 0
        await pool.query(`
            UPDATE empleados SET contadores = jsonb_set(contadores, '{${retardoId}}', '0'::jsonb) WHERE id = $1
        `, [empleadoId]);

        return {
            limiteAlcanzado: true,
            motivo: `Acumulación de ${limiteRetardos} retardos tipo ${reglaAplicada.id}`
        };
    }
    return { limiteAlcanzado: false, contadorActual };
}
