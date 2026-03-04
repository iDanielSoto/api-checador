
import fetch from 'node-fetch';

const API_URL = 'http://localhost:3002';
const CONFIG_ID = 'ITL-CFG-0000000000000000'; // El ID que encontramos
const TOL_ID = 'ITL-TOL-00000000000000000000000000000003';

async function test() {
    try {
        console.log('Probando actualización de Configuración...');
        const resConfig = await fetch(`${API_URL}/api/configuracion/${CONFIG_ID}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                intervalo_bloques_minutos: 45,
                requiere_salida: false,
                idioma: 'es'
            })
        });
        const dataConfig = await resConfig.json();
        console.log('Respuesta Config:', dataConfig);

        console.log('\nProbando actualización de Tolerancia...');
        const resTol = await fetch(`${API_URL}/api/tolerancias/${TOL_ID}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                nombre: 'General Mod',
                minutos_anticipado_max: 8,
                minutos_anticipo_salida: 5,
                minutos_posterior_salida: 10
            })
        });
        const dataTol = await resTol.json();
        console.log('Respuesta Tolerancia:', dataTol);

    } catch (e) {
        console.error(e);
    }
}
test();
