/**
 * IMPORTADOR: datos_departamentos.csv → tabla `departamentos`
 *
 * Esquema real:
 *   departamentos(id, nombre, descripcion, ubicacion, jefes, color, es_activo, empresa_id)
 *
 * Formato fuente:
 *   'CODIGO','NOMBRE','STATUS'
 *   STATUS: 'A' = activo, 'D' = dado de baja
 *
 * El CODIGO del archivo no tiene columna en BD — se guarda en `descripcion`
 * para referencia histórica (ej: "Cod: 110700").
 *
 * ¡Configura EMPRESA_ID y EMPRESA_PREFIJO antes de ejecutar!
 *
 * Uso: node scripts/import_departamentos.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import pkg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const { Pool } = pkg;
const pool = new Pool({
    host: process.env.DB_HOST, user: process.env.DB_USER,
    password: process.env.DB_PASSWORD, database: process.env.DB_NAME, port: process.env.DB_PORT
});

// ─── CONFIGURACIÓN ────────────────────────────────────────────────────────────
const EMPRESA_ID = 'SYS-EMA-00000000000000000000000000000004';          // <── UUID de la empresa destino
const EMPRESA_PREFIJO = 'tecnm-ED4';                        // <── prefijo del sistema de IDs
const ARCHIVO = 'd:/Proyectos/FASITLAC/data/datos_departamentos.csv';
const ENCODING = 'latin1';
const SOLO_ACTIVOS = false; // true = solo importar los con STATUS='A'
// ──────────────────────────────────────────────────────────────────────────────

async function nextId(tipo) {
    const sequences = { DEP: 'seq_departamentos' };
    const res = await pool.query(`SELECT nextval('${sequences[tipo]}') as num`);
    const hex = parseInt(res.rows[0].num).toString(16).toUpperCase().padStart(32, '0');
    return `${EMPRESA_PREFIJO}-${tipo}-${hex}`;
}

function parseRow(line) {
    const raw = line.trim().replace(/^'|'$/g, '').split(/','/);
    if (raw.length < 2) return null;
    const [codigo, nombre, status] = raw.map(v => v?.trim() ?? '');
    if (!nombre) return null;
    return { codigo, nombre, status: status || 'A' };
}

async function importar() {
    const contenido = fs.readFileSync(ARCHIVO, ENCODING);
    const filas = contenido.split('\n')
        .map(parseRow)
        .filter(Boolean)
        .filter(r => SOLO_ACTIVOS ? r.status === 'A' : true);

    console.log(`📂 Departamentos a importar: ${filas.length}`);

    // Cargar los ya existentes por nombre para deduplicar
    const existentes = await pool.query(
        `SELECT id, nombre FROM departamentos WHERE empresa_id = $1`, [EMPRESA_ID]
    );
    const porNombre = new Map(existentes.rows.map(r => [r.nombre.trim().toUpperCase(), r.id]));

    let insertados = 0, actualizados = 0, omitidos = 0;

    for (const dep of filas) {
        const nombreKey = dep.nombre.toUpperCase();
        const existeId = porNombre.get(nombreKey);
        const esActivo = dep.status === 'A';
        const descripcion = `Cod: ${dep.codigo}`;

        try {
            if (existeId) {
                await pool.query(`
                    UPDATE departamentos SET es_activo = $1, descripcion = COALESCE($2, descripcion)
                    WHERE id = $3
                `, [esActivo, descripcion, existeId]);
                actualizados++;
            } else {
                const id = await nextId('DEP');
                await pool.query(`
                    INSERT INTO departamentos (id, nombre, descripcion, ubicacion, jefes, color, es_activo, empresa_id)
                    VALUES ($1, $2, $3, null, null, '6366f1', $4, $5)
                `, [id, dep.nombre.substring(0, 55), descripcion, esActivo, EMPRESA_ID]);
                porNombre.set(nombreKey, id); // para deduplicar en la misma corrida
                insertados++;
            }
        } catch (err) {
            console.warn(`  ⚠️  "${dep.nombre}" — ${err.message}`);
            omitidos++;
        }
    }

    console.log(`✅ Insertados: ${insertados} | Actualizados: ${actualizados} | Omitidos: ${omitidos}`);
    await pool.end();
}

importar().catch(async err => {
    console.error('❌ Error fatal:', err.message);
    await pool.end();
    process.exit(1);
});
