import fs from 'fs';
import path from 'path';

const ARCHIVO = '../data/datos_empleadosITLAC.csv';
const contenido = fs.readFileSync(ARCHIVO, 'latin1');
const lineas = contenido.split('\n');

for (let i = 250; i < 265; i++) {
    const raw = lineas[i];
    if (raw) {
        // Regex to split by comma outside quotes
        const match = raw.match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g) || raw.split(',');
        console.log(`Línea ${i}: `, match.slice(-2)); // last 2 columns
    }
}
