// --- COPIA MOCK LOCAL DE LAS FUNCIONALIDADES DEL SERVICIO DE ASISTENCIAS ---
function srvBuscarBloqueActual(turnosDelDia, horaMinutos, intervaloBloquesMinutos, anticipoEntradaMax, posteriorSalidaMax = 60) {
    if (!turnosDelDia || turnosDelDia.length === 0) return null;
    const rangos = turnosDelDia.map(t => {
        const [he, me] = (t.inicio || t.entrada || "00:00").split(':').map(Number);
        const [hs, ms] = (t.fin || t.salida || "00:00").split(':').map(Number);
        return { entrada: he * 60 + me, salida: hs * 60 + ms };
    }).sort((a, b) => a.entrada - b.entrada);

    const bloques = [];
    let bActual = { ...rangos[0] };
    for (let i = 1; i < rangos.length; i++) {
        const rSiguiente = rangos[i];
        if ((rSiguiente.entrada - bActual.salida) <= intervaloBloquesMinutos) {
            bActual.salida = Math.max(bActual.salida, rSiguiente.salida);
        } else {
            bloques.push({ ...bActual });
            bActual = { ...rSiguiente };
        }
    }
    bloques.push(bActual);

    for (let i = 0; i < bloques.length; i++) {
        const b = bloques[i];
        let inicioBusqueda = b.entrada - (anticipoEntradaMax || 0);
        let finBusqueda = b.salida + (posteriorSalidaMax || 60);
        if (i > 0) {
            const mid = bloques[i - 1].salida + (b.entrada - bloques[i - 1].salida) / 2;
            inicioBusqueda = Math.max(inicioBusqueda, mid);
        }
        if (i < bloques.length - 1) {
            const mid = b.salida + (bloques[i + 1].entrada - b.salida) / 2;
            finBusqueda = Math.min(finBusqueda, mid);
        }
        if (horaMinutos >= inicioBusqueda && Math.floor(horaMinutos) <= Math.floor(finBusqueda)) return b;
    }
    return null;
}

function srvVerificarLongitudYTipo(registrosHoy, bloque, fechaISO, intervaloBloquesMinutos, requiereSalida = true, minutosAnticipoMax = 60, posteriorSalidaMax = 60) {
    if (!bloque) return { cerrado: false, tipo: 'entrada', entradas: 0, salidas: 0 };
    const hoyStr = fechaISO.substring(0, 10);
    const regsDelDia = registrosHoy.filter(r => r.fecha_registro.substring(0, 10) === hoyStr);

    const regsBloque = regsDelDia.filter(r => {
        const d = new Date(r.fecha_registro);
        const mins = d.getHours() * 60 + d.getMinutes();
        const margenAnticipo = minutosAnticipoMax || 0;
        const margenPosterior = posteriorSalidaMax || 60;
        return (mins >= bloque.entrada - margenAnticipo && mins <= bloque.salida + margenPosterior);
    });

    const entradas = regsBloque.filter(r => r.tipo === 'entrada').length;
    const salidas = regsBloque.filter(r => r.tipo === 'salida').length;
    let cerrado = false;
    let tipo = 'entrada';

    if (requiereSalida === false) {
        if (entradas > 0 || salidas > 0) { cerrado = true; tipo = 'completado'; }
    } else {
        if (entradas > 0 && salidas === 0) tipo = 'salida';
        else if (entradas > 0 && salidas > 0) { cerrado = true; tipo = 'completado'; }
    }
    return { cerrado, tipo, entradas, salidas };
}

function srvValidarVentanaDeRegistro(bloque, horaMinutos, tolerancia, tipoAsistencia) {
    if (!bloque) return { valido: false, mensaje: 'No hay bloque', estadoHorario: 'tiempo_insuficiente' };
    if (tipoAsistencia === 'entrada') {
        const anticipoEntrada = tolerancia.minutos_anticipado_max || 0;
        if (horaMinutos < bloque.entrada - anticipoEntrada) return { valido: false, mensaje: 'Aún no es hora entrada' };
        if (horaMinutos > bloque.salida) return { valido: false, mensaje: 'Horario entrada fin' };
    } else {
        const anticipoSalida = tolerancia.minutos_anticipo_salida || 0;
        const posteriorSalida = tolerancia.minutos_posterior_salida || 60;
        if (horaMinutos < bloque.salida - anticipoSalida) return { valido: false, mensaje: 'Aún no salida' };
        if (horaMinutos > bloque.salida + posteriorSalida) return { valido: false, mensaje: 'Max límite salida' };
    }
    return { valido: true };
}

function srvEvaluarEstado(tipoAsistencia, horaMinutos, bloque, tolerancia) {
    if (!bloque) return (tipoAsistencia === 'entrada') ? 'puntual' : 'salida_puntual';
    const aplicaHoy = true;
    if (tipoAsistencia === 'entrada') {
        const diff = horaMinutos - bloque.entrada;
        if (diff < 0) return 'entrada_temprana';
        if (diff === 0) return 'puntual';
        if (!aplicaHoy) return 'falta';
        const reglas = [...(tolerancia.reglas || [])].sort((a, b) => a.limite_minutos - b.limite_minutos);
        for (const r of reglas) if (diff <= r.limite_minutos) return r.id;
        return 'falta';
    } else {
        const diffSalida = bloque.salida - horaMinutos;
        if (diffSalida > 0) return 'salida_temprana';
        const posteriorPermitido = tolerancia.minutos_posterior_salida || 60;
        if (Math.abs(diffSalida) > posteriorPermitido) return 'salida_tarde';
        return 'salida_puntual';
    }
}

// --- CONFIGURACIONES MOck ---
const fechaPrueba = "2026-03-05T00:00:00.000Z";
const turnosHoy = [
    { inicio: "08:00", fin: "13:00" },
    { inicio: "14:00", fin: "18:00" },
    { inicio: "22:38", fin: "22:43" }
];

const configuracionTolerancia = {
    intervalo_bloques_minutos: 1,
    minutos_anticipado_max: 5,
    minutos_anticipo_salida: 5,
    minutos_posterior_salida: 1,
    dias_aplica: { 'jueves': true },
    requiere_salida: true,
    reglas: [
        { id: "retardo_a", limite_minutos: 10, penalizacion_valor: 2, penalizacion_tipo: 'acumulacion' },
        { id: "retardo_b", limite_minutos: 30, penalizacion_valor: 1, penalizacion_tipo: 'acumulacion' }
    ]
};

function hm2mins(h, m) { return h * 60 + m; }
function printResult(name, isOk, error) {
    const ico = isOk ? '✅' : '❌';
    console.log(`${ico} | ${name.padEnd(65, ' ')} -> ${isOk ? 'OK' : ('Fallo: ' + error)}`);
}

async function runTests() {
    console.log("\n==========================================================================");
    console.log("   TEST SUITE EXHAUSTIVO: MOTOR DE ASISTENCIAS (AISLADO)");
    console.log("==========================================================================\n");

    const pruebas = [
        { titulo: "[E1] Llegada Muy Temprana (Rechazada)", hora: hm2mins(7, 0), regsHoy: [], espera: { debeTenerBloque: false } },
        { titulo: "[E2] Llegada Temprana Permitida (Aceptada)", hora: hm2mins(7, 56), regsHoy: [], espera: { debeTenerBloque: true, evalua: 'entrada_temprana', valido: true, tipo: 'entrada', cerrado: false } },
        { titulo: "[E3] Llegada Puntual Perfecta", hora: hm2mins(8, 0), regsHoy: [], espera: { debeTenerBloque: true, evalua: 'puntual', valido: true, tipo: 'entrada', cerrado: false } },
        { titulo: "[E4] Retardo Menor (Retardo A)", hora: hm2mins(8, 7), regsHoy: [], espera: { debeTenerBloque: true, evalua: 'retardo_a', valido: true, tipo: 'entrada', cerrado: false } },
        { titulo: "[E5] Retardo Mayor (Retardo B)", hora: hm2mins(8, 25), regsHoy: [], espera: { debeTenerBloque: true, evalua: 'retardo_b', valido: true, tipo: 'entrada', cerrado: false } },
        { titulo: "[E6] Falta por impuntualidad (>30m del ultimo retardo configurable)", hora: hm2mins(8, 45), regsHoy: [], espera: { debeTenerBloque: true, evalua: 'falta', valido: true, tipo: 'entrada', cerrado: false } },
        { titulo: "[I1] Doble Entrada Intento (Obliga Salida)", hora: hm2mins(12, 0), regsHoy: [{ tipo: 'entrada', fecha_registro: "2026-03-05T08:00:00" }], espera: { debeTenerBloque: true, tipo: 'salida', cerrado: false } },
        { titulo: "[I2] Salida Registrada -> Bloque CERRADO", hora: hm2mins(12, 10), regsHoy: [{ tipo: 'entrada', fecha_registro: "2026-03-05T08:00:00" }, { tipo: 'salida', fecha_registro: "2026-03-05T13:00:00" }], espera: { debeTenerBloque: true, cerrado: true } },
        { titulo: "[S1] Salida Muy Temprana (Rechazada)", hora: hm2mins(12, 0), regsHoy: [{ tipo: 'entrada', fecha_registro: "2026-03-05T08:00:00" }], espera: { debeTenerBloque: true, valido: false } },
        { titulo: "[S2] Salida Anticipada Temprana Permitida", hora: hm2mins(12, 57), regsHoy: [{ tipo: 'entrada', fecha_registro: "2026-03-05T08:00:00" }], espera: { debeTenerBloque: true, evalua: 'salida_temprana', valido: true, tipo: 'salida', cerrado: false } },
        { titulo: "[S3] Salida Puntual (A la hora exacta)", hora: hm2mins(13, 0), regsHoy: [{ tipo: 'entrada', fecha_registro: "2026-03-05T08:00:00" }], espera: { debeTenerBloque: true, evalua: 'salida_puntual', valido: true, tipo: 'salida', cerrado: false } },
        { titulo: "[S4] Salida Posterior Permitida (Dentro de 1 min de gracia)", hora: hm2mins(13, 1), regsHoy: [{ tipo: 'entrada', fecha_registro: "2026-03-05T08:00:00" }], espera: { debeTenerBloque: true, evalua: 'salida_tarde', valido: true, tipo: 'salida', cerrado: false } },
        { titulo: "[S5] Salida Excesivamente Tarde (> 1m)", hora: hm2mins(13, 10), regsHoy: [{ tipo: 'entrada', fecha_registro: "2026-03-05T08:00:00" }], espera: { debeTenerBloque: true, valido: false } },
        { titulo: "[M1] Check-in en Turno 2", hora: hm2mins(14, 0), regsHoy: [{ tipo: 'entrada', fecha_registro: "2026-03-05T08:00:00" }, { tipo: 'salida', fecha_registro: "2026-03-05T13:00:00" }], espera: { debeTenerBloque: true, tipo: 'entrada', cerrado: false, evalua: 'puntual' } },
        { titulo: "[C1] Caso Cliente: Salida de Turnover Corto 22:38 a 22:43", hora: hm2mins(22, 38), regsHoy: [{ tipo: 'entrada', fecha_registro: "2026-03-05T22:33:00" }], espera: { debeTenerBloque: true, evalua: 'salida_temprana', valido: true, tipo: 'salida', cerrado: false } }
    ];

    let testPass = 0;
    for (const test of pruebas) {
        let isP = true;
        let errStr = "";

        const b = srvBuscarBloqueActual(turnosHoy, test.hora, configuracionTolerancia.intervalo_bloques_minutos, configuracionTolerancia.minutos_anticipado_max, configuracionTolerancia.minutos_posterior_salida);

        if (!b) {
            if (test.espera.debeTenerBloque === false) testPass++;
            else isP = false, errStr = "NO HALLO BLOQUE Y SE ESPERABA QUE SÍ";
            printResult(test.titulo, isP, errStr);
            continue;
        } else if (b && test.espera.debeTenerBloque === false) {
            isP = false, errStr = "HALLO BLOQUE Y NO DEBÍA";
            printResult(test.titulo, isP, errStr);
            continue;
        }

        const dbVerification = srvVerificarLongitudYTipo(test.regsHoy, b, fechaPrueba, configuracionTolerancia.intervalo_bloques_minutos, configuracionTolerancia.requiere_salida, configuracionTolerancia.minutos_anticipado_max, configuracionTolerancia.minutos_posterior_salida);

        if (test.espera.cerrado !== undefined && dbVerification.cerrado !== test.espera.cerrado) isP = false, errStr += `| Exp cerr=${test.espera.cerrado}, Obt ${dbVerification.cerrado} `;
        if (test.espera.tipo !== undefined && dbVerification.tipo !== test.espera.tipo) isP = false, errStr += `| Exp tipo='${test.espera.tipo}', Obt '${dbVerification.tipo}' `;

        if (!dbVerification.cerrado) {
            const win = srvValidarVentanaDeRegistro(b, test.hora, configuracionTolerancia, dbVerification.tipo);
            if (test.espera.valido !== undefined && win.valido !== test.espera.valido) isP = false, errStr += `| Exp val=${test.espera.valido}, Obt ${win.valido} `;

            if (win.valido && test.espera.evalua !== undefined) {
                const evalSt = srvEvaluarEstado(dbVerification.tipo, test.hora, b, configuracionTolerancia);
                if (evalSt !== test.espera.evalua) isP = false, errStr += `| Exp est='${test.espera.evalua}', Obt '${evalSt}' `;
            }
        }
        if (isP) testPass++;
        printResult(test.titulo, isP, errStr);
    }

    console.log(`\n============== PASADOS: ${testPass} / ${pruebas.length} TOTALES ==============`);
}

runTests();
