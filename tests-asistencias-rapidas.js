import {
    srvVerificarLongitudYTipo,
    srvBuscarBloqueActual,
    srvEvaluarEstado,
    srvValidarVentanaDeRegistro
} from './src/services/asistencias.service.js';

// --- CONFIGURACIONES MOck ---
const fechaPrueba = "2026-03-05T00:00:00.000Z";
const turnosHoy = [
    { inicio: "08:00", fin: "13:00" },
    { inicio: "14:00", fin: "18:00" },
    { inicio: "22:38", fin: "22:43" } // El turno de prueba cortito del usuario
];

const configuracionTolerancia = {
    intervalo_bloques_minutos: 1, // Separación min. entre turnos
    minutos_anticipado_max: 5,    // Permite checar hasta 5 min antes (ej. 7:55)
    minutos_anticipo_salida: 5,    // Permite salir hasta 5 min antes
    minutos_posterior_salida: 1,  // Permite salir hasta 1 min despues
    dias_aplica: {
        'jueves': true
    },
    requiere_salida: true,
    reglas: [
        { id: "retardo_a", limite_minutos: 10, penalizacion_valor: 2, penalizacion_tipo: 'acumulacion' },
        { id: "retardo_b", limite_minutos: 30, penalizacion_valor: 1, penalizacion_tipo: 'acumulacion' }
    ]
};

// --- HELPERS ---
function hm2mins(h, m) { return h * 60 + m; }
function printResult(name, bloque, isOk, error) {
    const ico = isOk ? '✅' : '❌';
    console.log(`${ico} | ${name.padEnd(60, ' ')} -> ${isOk ? 'OK' : ('Fallo: ' + error)}`);
}

async function runTests() {
    console.log("==========================================================================");
    console.log("   TEST SUITE EXHAUSTIVO: MOTOR DE ASISTENCIAS FASITLAC (NODE ENV)");
    console.log("==========================================================================\n");

    const pruebas = [
        // ====== ESCENARIOS DE ENTRADA ======
        {
            titulo: "[E1] Llegada Muy Temprana (Rechazada)",
            hora: hm2mins(7, 0), // 7:00am, el turno es 8:00am y max anticipo es 5m.
            regsHoy: [],
            espera: { debeTenerBloque: false }
        },
        {
            titulo: "[E2] Llegada Temprana Permitida (Aceptada)",
            hora: hm2mins(7, 56), // 7:56am, turno 8:00, OK porque 4 < 5 de anticipo max.
            regsHoy: [],
            espera: { debeTenerBloque: true, evalua: 'entrada_temprana', valido: true, tipo: 'entrada', cerrado: false }
        },
        {
            titulo: "[E3] Llegada Puntual Perfecta",
            hora: hm2mins(8, 0),
            regsHoy: [],
            espera: { debeTenerBloque: true, evalua: 'puntual', valido: true, tipo: 'entrada', cerrado: false }
        },
        {
            titulo: "[E4] Retardo Menor (Retardo A)",
            hora: hm2mins(8, 7), // 7 mins tarde
            regsHoy: [],
            espera: { debeTenerBloque: true, evalua: 'retardo_a', valido: true, tipo: 'entrada', cerrado: false }
        },
        {
            titulo: "[E5] Retardo Mayor (Retardo B)",
            hora: hm2mins(8, 25), // 25 mins tarde
            regsHoy: [],
            espera: { debeTenerBloque: true, evalua: 'retardo_b', valido: true, tipo: 'entrada', cerrado: false }
        },
        {
            titulo: "[E6] Falta por impuntualidad (>30m del ultimo retardo configurable)",
            hora: hm2mins(8, 45),
            regsHoy: [],
            espera: { debeTenerBloque: true, evalua: 'falta', valido: true, tipo: 'entrada', cerrado: false }
        },

        // ====== ESCENARIOS INTERMEDIOS (DOBLES REGISTROS) ======
        {
            titulo: "[I1] Doble Entrada Intento (Bloqueada: Ya detectó que sigue Salida)",
            hora: hm2mins(12, 0),
            regsHoy: [{ tipo: 'entrada', fecha_registro: "2026-03-05T08:00:00" }],
            espera: { debeTenerBloque: true, tipo: 'salida', cerrado: false }
        },
        {
            titulo: "[I2] Salida Registrada -> Bloque Completamente Cerrado",
            hora: hm2mins(12, 10),
            regsHoy: [
                { tipo: 'entrada', fecha_registro: "2026-03-05T08:00:00" },
                { tipo: 'salida', fecha_registro: "2026-03-05T13:00:00" }
            ],
            espera: { debeTenerBloque: true, cerrado: true } // El verificador debe decir que este bloque ya no acepta nada.
        },

        // ====== ESCENARIOS DE SALIDA ======
        {
            titulo: "[S1] Salida Muy Temprana (Rechazada por regla de anticipo=5)",
            hora: hm2mins(12, 0),  // Faltan 60 mins para la salida, anticipo max es 5
            regsHoy: [{ tipo: 'entrada', fecha_registro: "2026-03-05T08:00:00" }],
            espera: { debeTenerBloque: true, valido: false } // SrvValidarVentanaDeRegistro debe escupir false
        },
        {
            titulo: "[S2] Salida Anticipada Temprana Permitida",
            hora: hm2mins(12, 57), // Faltan 3 mins, Max Anticipo = 5
            regsHoy: [{ tipo: 'entrada', fecha_registro: "2026-03-05T08:00:00" }],
            // Aquí confirmamos que el motor retorna 'salida_temprana' textualmente como vimos en la foto del cliente.
            espera: { debeTenerBloque: true, evalua: 'salida_temprana', valido: true, tipo: 'salida', cerrado: false }
        },
        {
            titulo: "[S3] Salida Puntual (A la hora exacta)",
            hora: hm2mins(13, 0),
            regsHoy: [{ tipo: 'entrada', fecha_registro: "2026-03-05T08:00:00" }],
            espera: { debeTenerBloque: true, evalua: 'salida_puntual', valido: true, tipo: 'salida', cerrado: false }
        },
        {
            titulo: "[S4] Salida Posterior Permitida (Dentro de 1 min de gracia)",
            hora: hm2mins(13, 1),
            regsHoy: [{ tipo: 'entrada', fecha_registro: "2026-03-05T08:00:00" }],
            espera: { debeTenerBloque: true, evalua: 'salida_tarde', valido: true, tipo: 'salida', cerrado: false } // Salida posterior marca como salida tarde en los evaluadores si es mayor de los esperados
        },
        {
            titulo: "[S5] Salida Expensivamente Tarde (Rechazada / Se va al Cron)",
            hora: hm2mins(13, 10), // Pasaron 10 mins, Posterior MAX = 1
            regsHoy: [{ tipo: 'entrada', fecha_registro: "2026-03-05T08:00:00" }],
            espera: { debeTenerBloque: true, valido: false } // El bloque nos acepta, pero ValidarVentanaDeRegistro nos dirá 'fuera de limite posterior'
        },

        // ====== ESCENARIOS MULTI-TURNO ======
        {
            titulo: "[M1] Check-in en Turno 2 sin interferencia del Turno 1",
            hora: hm2mins(14, 0),
            regsHoy: [
                { tipo: 'entrada', fecha_registro: "2026-03-05T08:00:00" },
                { tipo: 'salida', fecha_registro: "2026-03-05T13:00:00" }
            ],
            espera: { debeTenerBloque: true, tipo: 'entrada', cerrado: false, evalua: 'puntual' }
        },

        // ====== ESCENARIO ESPECIAL CLIENTE ======
        {
            titulo: "[C1] Prueba Real Cliente (Turno 22:38 a 22:43) Check-Out",
            hora: hm2mins(22, 38), // Entró a las 33 y checó out a las 38, que es 5 mins antes del 43 (permitido por su tope 5)
            regsHoy: [
                { tipo: 'entrada', fecha_registro: "2026-03-05T22:33:00" }
            ],
            espera: { debeTenerBloque: true, evalua: 'salida_temprana', valido: true, tipo: 'salida', cerrado: false }
        }
    ];

    let testPass = 0;

    for (const test of pruebas) {
        let isP = true;
        let errStr = "";

        // 1. Buscar el bloque
        const b = srvBuscarBloqueActual(
            turnosHoy,
            test.hora,
            configuracionTolerancia.intervalo_bloques_minutos,
            configuracionTolerancia.minutos_anticipado_max,
            configuracionTolerancia.minutos_posterior_salida
        );

        if (!b) {
            if (test.espera.debeTenerBloque === false) {
                printResult(test.titulo, b, true);
                testPass++;
            } else {
                printResult(test.titulo, b, false, "El buscador no halló bloque (retornó null) y se esperaba que sí.");
            }
            continue;
        } else if (b && test.espera.debeTenerBloque === false) {
            printResult(test.titulo, b, false, "El buscador HALLÓ bloque y se esperaba que fuera null.");
            continue;
        }

        // 2. Verificar Ventana (Bloqueos)
        const dbVerification = srvVerificarLongitudYTipo(
            test.regsHoy,
            b,
            fechaPrueba,
            configuracionTolerancia.intervalo_bloques_minutos,
            configuracionTolerancia.requiere_salida,
            configuracionTolerancia.minutos_anticipado_max,
            configuracionTolerancia.minutos_posterior_salida
        );

        if (test.espera.cerrado !== undefined && dbVerification.cerrado !== test.espera.cerrado) {
            isP = false;
            errStr += `| Esperaba cerrado=${test.espera.cerrado}, obtuvo ${dbVerification.cerrado} `;
        }

        let tipo = dbVerification.tipo;
        if (test.espera.tipo !== undefined && tipo !== test.espera.tipo) {
            isP = false;
            errStr += `| Esperaba tipo='${test.espera.tipo}', obtuvo '${tipo}' `;
        }

        // Si el bloque está cerrado, entonces "valido" no se evalúa más (el controller lo bloquea nativamente).
        if (!dbVerification.cerrado) {
            const win = srvValidarVentanaDeRegistro(b, test.hora, configuracionTolerancia, tipo);

            if (test.espera.valido !== undefined && win.valido !== test.espera.valido) {
                isP = false;
                errStr += `| VentanaV falló. Exp: ${test.espera.valido}, Obt: ${win.valido} (${win.mensaje}) `;
            }

            if (win.valido && test.espera.evalua !== undefined) {
                // Evaluacion de retraso o puntualidad
                const evalSt = srvEvaluarEstado(tipo, test.hora, b, configuracionTolerancia);

                // Mapear un poco porque el evaluador puede ser un array id de retardo u output texto
                if (evalSt !== test.espera.evalua) {
                    isP = false;
                    errStr += `| ESTADO NO COINCIDE. Exp: '${test.espera.evalua}', Obt: '${evalSt}' `;
                }
            }
        }

        if (isP) testPass++;
        printResult(test.titulo, b, isP, errStr);
    }

    console.log(`\n==========================================================================`);
    console.log(`  RESULTADOS FINALES: ${testPass} FUNCIONALES / ${pruebas.length} TOTALES`);
    console.log(`==========================================================================`);
}

runTests();
