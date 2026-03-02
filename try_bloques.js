import {
    srvBuscarBloqueActual,
    srvDentroDeTurnoVisual,
    srvEvaluarEstado
} from './src/services/asistencias.service.js';

// Simulamos los turnos de un día con un intervalo de "1 hora" separados
// Bloque 1: 08:00 a 10:00 y 10:30 a 12:00 -> Deberían unirse si intervalo >= 30 mins
// Bloque 2: 15:00 a 18:00
const turnosHoy = [
    { entrada: '08:00', salida: '10:00' },
    { entrada: '10:30', salida: '12:00' }, // 30 min separación
    { entrada: '13:00', salida: '14:00' }, // 60 min separación
    { entrada: '16:00', salida: '18:00' }, // 120 min separación
];

// Opciones de configuración
const anticipoMax = 60; // 1 hora máximo para checar antes

console.log("=== PRUEBA DE BLOQUES COMPUESTOS ===");

function test(horaString, intervaloBloquesMinutos) {
    const [h, m] = horaString.split(':').map(Number);
    const horaMinutos = h * 60 + m;

    console.log(`\n--- Evaluando hora: ${horaString} (Intervalo para fusionar: ${intervaloBloquesMinutos} mins) ---`);
    const bloque = srvBuscarBloqueActual(turnosHoy, horaMinutos, intervaloBloquesMinutos, anticipoMax);

    if (bloque) {
        let e = Math.floor(bloque.entrada / 60).toString().padStart(2, '0') + ':' + (bloque.entrada % 60).toString().padStart(2, '0');
        let s = Math.floor(bloque.salida / 60).toString().padStart(2, '0') + ':' + (bloque.salida % 60).toString().padStart(2, '0');
        console.log(`✅ Bloque Asignado: Entrada: ${e} (${bloque.strEntrada}) -> Salida: ${s} (${bloque.strSalida})`);
        console.log(`   Dentro de Turno Visual (Estricto): ${srvDentroDeTurnoVisual(bloque, horaMinutos)}`);
    } else {
        console.log("❌ Ningún bloque asignado");
    }
}

// 1. Con un intervalo de 60 minutos (Fusionará los de 30 y 60 mins de separación)
test('07:50', 60); // Debería dar el primer megabloque: 08:00 a 14:00
test('11:00', 60); // Sigue en el megabloque: 08:00 a 14:00
test('15:50', 60); // Debería dar el segundo bloque: 16:00 a 18:00

// 2. Con un intervalo de 15 minutos (NADA se fusionará)
test('08:00', 15); // Bloque 08:00 a 10:00
test('10:20', 15); // Bloque 10:30 a 12:00
test('12:55', 15); // Bloque 13:00 a 14:00

console.log("\n=== PRUEBA DE TOLERANCIA ===");
const reglaToleranciaMock = {
    dias_aplica: { lunes: true, martes: true, miercoles: true, jueves: true, viernes: true, sabado: true, domingo: true },
    reglas: [
        { id: 'retardo_a', limite_minutos: 15 },
        { id: 'retardo_b', limite_minutos: 30 }
    ],
    aplica_tolerancia_salida: false
};

const minHora = 8 * 60 + 10; // 08:10
const bloqueMock = { entrada: 8 * 60, salida: 10 * 60 }; // Entrada 8:00

console.log("Hora de llegada: 08:10. Entrada esperada: 08:00");
console.log("Estado:", srvEvaluarEstado('entrada', minHora, bloqueMock, reglaToleranciaMock)); // Debe ser retardo_a

const minHora2 = 8 * 60 + 25; // 08:25
console.log("Hora de llegada: 08:25. Entrada esperada: 08:00");
console.log("Estado:", srvEvaluarEstado('entrada', minHora2, bloqueMock, reglaToleranciaMock)); // Debe ser retardo_b

const minHora3 = 8 * 60 + 40; // 08:40
console.log("Hora de llegada: 08:40. Entrada esperada: 08:00");
console.log("Estado:", srvEvaluarEstado('entrada', minHora3, bloqueMock, reglaToleranciaMock)); // Debe ser falta
process.exit(0);
