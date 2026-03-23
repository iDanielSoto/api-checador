/**
 * IMPORTADOR: horarios.txt → tabla `horarios` + asignación en `empleados`
 *
 * Esquema real:
 *   horarios(id, fecha_inicio, fecha_fin, configuracion JSONB, es_activo, empresa_id)
 *   empleados.horario_id → FK a horarios.id  (1 empleado : 1 horario activo)
 *
 * El campo `configuracion` es el JSONB que consume el sistema. Estructura esperada
 * (deducida de asistencias.helpers.js y sync controller):
 * {
 *   turnos: [
 *     {
 *       nombre: string,
 *       hora_inicio: "HH:MM",
 *       hora_fin: "HH:MM",
 *       dias: ["lunes","martes",...],  // días en que aplica este turno
 *     }
 *   ]
 * }
 *
 * Algoritmo:
 *  1. Parsea el NDJSON concatenado del archivo
 *  2. Agrupa por RFC → genera un único horario por empleado
 *     con todos los rangos horarios distintos (turno = bloque de horas + días)
 *  3. Detecta si hay turno matutino (≤13:00) y/o vespertino/nocturno (>13:00)
 *     y los guarda como turnos separados dentro de configuracion
 *  4. Crea el horario y lo asigna al empleado
 *
 * ¡Configura EMPRESA_ID y EMPRESA_PREFIJO antes de ejecutar!
 *
 * Uso: node scripts/import_horarios.mjs
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
const ARCHIVO = 'd:/Proyectos/FASITLAC/data/horarios.txt';
const ENCODING = 'latin1';

// Periodo a importar (null = todos los periodos del archivo)
const PERIODO_FILTRO = '20261';  // ej: '20261', o null para todos

// Solo importar empleados que ya existan en BD (no crear empleados nuevos aquí)
const SOLO_EXISTENTES = true;
// ──────────────────────────────────────────────────────────────────────────────

const DIA_NOMBRES = {
    1: 'domingo', 2: 'lunes', 3: 'martes',
    4: 'miercoles', 5: 'jueves', 6: 'viernes', 7: 'sabado'
};

/**
 * Parsea "Jan 01 1900 07:00AM" → "07:00"
 */
function parseHora(raw) {
    if (!raw) return null;
    const match = raw.match(/(\d{1,2}):(\d{2})(AM|PM)/i);
    if (!match) return null;
    let [, h, m, ampm] = match;
    h = parseInt(h);
    if (ampm.toUpperCase() === 'PM' && h !== 12) h += 12;
    if (ampm.toUpperCase() === 'AM' && h === 12) h = 0;
    return `${String(h).padStart(2, '0')}:${m}`;
}

function minutosDeHora(t) {
    if (!t) return 0;
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
}

/**
 * Extrae todos los objetos JSON del archivo NDJSON concatenado.
 */
function extraerRegistros(contenido) {
    const registros = [];
    let depth = 0, start = -1;
    for (let i = 0; i < contenido.length; i++) {
        const c = contenido[i];
        if (c === '{') { if (depth === 0) start = i; depth++; }
        else if (c === '}') {
            depth--;
            if (depth === 0 && start !== -1) {
                try { registros.push(JSON.parse(contenido.slice(start, i + 1))); } catch (_) { }
                start = -1;
            }
        }
    }
    return registros;
}

function construirConfiguracion(sesiones, rfc, periodo) {
    const configuracion_semanal = {
        lunes: [], martes: [], miercoles: [], jueves: [], viernes: [], sabado: [], domingo: []
    };

    for (const s of sesiones) {
        const hi = parseHora(s.hora_inicial);
        const hf = parseHora(s.hora_final);
        if (!hi || !hf) continue;

        const diaStr = DIA_NOMBRES[s.dia_semana];
        if (diaStr && configuracion_semanal[diaStr]) {
            const existe = configuracion_semanal[diaStr].find(t => t.inicio === hi && t.fin === hf);
            if (!existe) {
                configuracion_semanal[diaStr].push({ inicio: hi, fin: hf });
            }
        }
    }

    for (const dia in configuracion_semanal) {
        configuracion_semanal[dia].sort((a, b) => minutosDeHora(a.inicio) - minutosDeHora(b.inicio));
    }

    return {
        configuracion_semanal,
        periodo_academico: periodo,
        tipo_horario: sesiones[0]?.tipo_horario || 'D',
        materias: [...new Set(sesiones.map(s => s.materia).filter(Boolean))]
    };
}

async function nextId(tipo) {
    const seq = { HOR: 'seq_horarios' }[tipo];
    const res = await pool.query(`SELECT nextval('${seq}') as num`);
    const hex = parseInt(res.rows[0].num).toString(16).toUpperCase().padStart(32, '0');
    return `${EMPRESA_PREFIJO}-${tipo}-${hex}`;
}

async function importar() {
    const contenido = fs.readFileSync(ARCHIVO, ENCODING);
    let registros = extraerRegistros(contenido);

    if (PERIODO_FILTRO) {
        registros = registros.filter(r => r.periodo === PERIODO_FILTRO);
    }
    console.log(`📂 Sesiones cargadas: ${registros.length}${PERIODO_FILTRO ? ` (periodo ${PERIODO_FILTRO})` : ''}`);

    // Cargar mapa RFC → empleado_id desde BD
    const empRes = await pool.query(
        `SELECT e.id, e.rfc FROM empleados e
         INNER JOIN usuarios u ON u.id = e.usuario_id
         WHERE u.empresa_id = $1`, [EMPRESA_ID]
    );
    const empMap = Object.fromEntries(empRes.rows.map(r => [r.rfc.trim(), r.id]));
    console.log(`👤 Empleados en BD: ${empRes.rows.length}`);

    // Agrupar sesiones por RFC  (un horario por empleado)
    const porRFC = new Map();
    let sinEmpleado = 0;
    for (const r of registros) {
        const rfc = r.rfc?.trim();
        if (!rfc) continue;
        if (SOLO_EXISTENTES && !empMap[rfc]) { sinEmpleado++; continue; }
        if (!porRFC.has(rfc)) porRFC.set(rfc, []);
        porRFC.get(rfc).push(r);
    }
    console.log(`📅 Empleados con sesiones: ${porRFC.size} | Sin empleado en BD: ${sinEmpleado}`);

    let insertados = 0, actualizados = 0, omitidos = 0;

    for (const [rfc, sesiones] of porRFC) {
        const empleado_id = empMap[rfc];
        const configuracion = construirConfiguracion(sesiones, rfc, PERIODO_FILTRO || sesiones[0]?.periodo);

        // Usando la primera y última fecha del periodo como rango
        const fecha_inicio = PERIODO_FILTRO
            ? `${PERIODO_FILTRO.slice(0, 4)}-01-01`
            : new Date().toISOString().slice(0, 10);
        const fecha_fin = PERIODO_FILTRO
            ? `${PERIODO_FILTRO.slice(0, 4)}-12-31`
            : null;

        try {
            // ¿Ya tiene horario asignado este empleado?
            const empActual = empleado_id
                ? await pool.query(`SELECT horario_id FROM empleados WHERE id = $1`, [empleado_id])
                : null;
            const horarioExistente = empActual?.rows[0]?.horario_id;

            if (horarioExistente) {
                // Actualizar el horario existente
                await pool.query(`
                    UPDATE horarios SET
                        configuracion = $1,
                        fecha_inicio = $2,
                        fecha_fin = $3,
                        es_activo = true
                    WHERE id = $4
                `, [JSON.stringify(configuracion), fecha_inicio, fecha_fin, horarioExistente]);
                actualizados++;
            } else {
                // Crear nuevo horario y asignarlo
                const horId = await nextId('HOR');
                await pool.query(`
                    INSERT INTO horarios (id, fecha_inicio, fecha_fin, configuracion, es_activo, empresa_id)
                    VALUES ($1, $2, $3, $4, true, $5)
                `, [horId, fecha_inicio, fecha_fin, JSON.stringify(configuracion), EMPRESA_ID]);

                // Asignar al empleado si existe en BD
                if (empleado_id) {
                    await pool.query(
                        `UPDATE empleados SET horario_id = $1 WHERE id = $2`,
                        [horId, empleado_id]
                    );
                }
                insertados++;
            }

        } catch (err) {
            console.warn(`  ⚠️  ${rfc} — ${err.message}`);
            omitidos++;
        }
    }

    console.log(`✅ Creados: ${insertados} | Actualizados: ${actualizados} | Omitidos: ${omitidos}`);
    await pool.end();
}

importar().catch(async err => {
    console.error('❌ Error fatal:', err.message);
    await pool.end();
    process.exit(1);
});
