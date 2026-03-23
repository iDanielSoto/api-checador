/**
 * IMPORTADOR: datos_empleadosITLAC.csv → tablas `usuarios` + `empleados` + `empleados_departamentos`
 *
 * Esquema real:
 *   usuarios(id, nombre, correo, usuario, telefono, empresa_id, estado_cuenta, ...)
 *   empleados(id, rfc, nss, regimen_laboral, usuario_id, horario_id, fecha_registro)
 *   empleados_departamentos(id, empleado_id, departamento_id, es_activo)
 *
 * Formato fuente (CSV, latin1):
 *   'RFC','DEPTO_CODIGO','AP_PATERNO','NOMBRE','CALLE','COLONIA','CP','TEL','SEXO',FECHA_NAC,'PUESTO','EMAIL'
 *
 * Flujo por empleado:
 *   1. Buscar si ya existe usuario por correo o por RFC en empleados
 *   2. Si no existe: INSERT en usuarios → INSERT en empleados
 *   3. Buscar departamento por descripcion (cod) → INSERT en empleados_departamentos
 *
 * ¡Configura EMPRESA_ID y EMPRESA_PREFIJO antes de ejecutar!
 *
 * Uso: node scripts/import_empleados.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcrypt';
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
const EMPRESA_PREFIJO = 'tecnm-ED4';                        // <── prefijo del sistema de IDs                      // <── prefijo del sistema de IDs
const ARCHIVO = 'd:/Proyectos/FASITLAC/data/datos_empleadosITLAC.csv';
const ENCODING = 'latin1';

// Contraseña temporal asignada a todos los empleados importados
// (deben cambiarla en el primer inicio de sesión)
const PASSWORD_DEFAULT = 'Itlac2024!';
// ──────────────────────────────────────────────────────────────────────────────

const SEQUENCES = {
    USU: 'seq_usuarios',
    EMP: 'seq_empleados',
    EDO: 'seq_empleados_departamentos'
};

async function nextId(tipo) {
    const seq = SEQUENCES[tipo];
    const res = await pool.query(`SELECT nextval('${seq}') as num`);
    const hex = parseInt(res.rows[0].num).toString(16).toUpperCase().padStart(32, '0');
    return `${EMPRESA_PREFIJO}-${tipo}-${hex}`;
}

function parseRow(line) {
    if (!line.trim()) return null;
    const cols = line.split(/,(?=(?:(?:[^']*'){2})*[^']*$)/);
    if (cols.length < 3) return null;

    // Remover las comillas de cada columna extraída
    const cleanCols = cols.map(c => c.replace(/^'|'$/g, '').trim());

    const [rfc, depto_codigo, ap_paterno, nombre_pila, calle, colonia, cp, telefono, sexo, fecha_nac_raw, puesto, email] = cleanCols;

    const rfcLimpio = rfc?.trim();
    if (!rfcLimpio || rfcLimpio.length < 4) return null;
    if (!nombre_pila?.trim() && !ap_paterno?.trim()) return null;

    let fecha_nacimiento = null;
    if (fecha_nac_raw?.trim()) {
        const [datePart] = fecha_nac_raw.trim().split(' ');
        const d = new Date(datePart);
        if (!isNaN(d)) fecha_nacimiento = datePart;
    }

    const nombre_completo = [nombre_pila?.trim(), ap_paterno?.trim()].filter(Boolean).join(' ');
    const correo_limpio = email?.trim() || null;
    // Usuario: parte antes del @ si hay correo, sino el RFC en minúsculas
    const usuario_login = correo_limpio
        ? correo_limpio.split('@')[0].toLowerCase().replace(/[^a-z0-9._-]/g, '')
        : rfcLimpio.toLowerCase();

    const telefono_limpio = telefono?.trim()?.replace(/[^0-9]/g, '');

    return {
        rfc: rfcLimpio,
        depto_codigo: depto_codigo?.trim() || null,
        nombre: nombre_completo,
        correo: correo_limpio,
        usuario: usuario_login,
        telefono: telefono_limpio && telefono_limpio.length >= 10 ? telefono_limpio : null,
        puesto: puesto?.trim() || null,
        fecha_nacimiento
    };
}

async function importar() {
    const contenido = fs.readFileSync(ARCHIVO, ENCODING);
    const todasFilas = contenido.split('\n').map(parseRow).filter(Boolean);

    // Deduplicar por RFC (mejor candidato = más campos llenos)
    const porRFC = new Map();
    for (const emp of todasFilas) {
        const prev = porRFC.get(emp.rfc);
        const score = v => Object.values(v).filter(Boolean).length;
        if (!prev || score(emp) > score(prev)) porRFC.set(emp.rfc, emp);
    }
    const empleados = [...porRFC.values()];
    console.log(`📂 Empleados únicos: ${empleados.length} (de ${todasFilas.length} filas)`);

    // Cargar mapa de departamentos: "Cod: XXXXXX" → departamento_id
    const depRes = await pool.query(
        `SELECT id, descripcion FROM departamentos WHERE empresa_id = $1`, [EMPRESA_ID]
    );
    // El script de dept guarda codigo en descripcion como "Cod: 110700"
    const depMap = {};
    for (const r of depRes.rows) {
        const match = r.descripcion?.match(/Cod:\s*(\S+)/i);
        if (match) depMap[match[1].trim()] = r.id;
    }
    console.log(`🏢 Departamentos cargados: ${Object.keys(depMap).length}`);

    const passwordHash = await bcrypt.hash(PASSWORD_DEFAULT, 10);

    let insertados = 0, omitidos = 0;

    for (const emp of empleados) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // 1. Verificar si ya existe por RFC
            const existEmp = await client.query(
                `SELECT e.id, e.usuario_id FROM empleados e WHERE e.rfc = $1`, [emp.rfc]
            );
            if (existEmp.rows.length > 0) {
                await client.query('ROLLBACK');
                omitidos++;
                continue;
            }

            // 2. Crear usuario
            const usuId = await nextId('USU');
            const correoFinal = emp.correo ? emp.correo : `${emp.usuario.toLowerCase()}@no-email.localhost`;
            await client.query(`
                INSERT INTO usuarios (
                    id, empresa_id, nombre, correo, usuario,
                    contraseña, telefono, estado_cuenta, fecha_registro
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'activo', NOW())
            `, [usuId, EMPRESA_ID, emp.nombre, correoFinal, emp.usuario,
                passwordHash, emp.telefono]);

            // 3. Crear empleado
            const empId = await nextId('EMP');
            await client.query(`
                INSERT INTO empleados (id, usuario_id, rfc, regimen_laboral, fecha_registro)
                VALUES ($1, $2, $3, $4, NOW())
            `, [empId, usuId, emp.rfc, emp.puesto || 'base']);

            // 4. Asignar departamento si existe el mapeo
            if (emp.depto_codigo && depMap[emp.depto_codigo]) {
                const edoId = await nextId('EDO');
                await client.query(`
                    INSERT INTO empleados_departamentos (id, empleado_id, departamento_id, es_activo)
                    VALUES ($1, $2, $3, true)
                `, [edoId, empId, depMap[emp.depto_codigo]]);
            }

            await client.query('COMMIT');
            insertados++;

            if (insertados % 50 === 0) console.log(`  ... ${insertados} insertados`);

        } catch (err) {
            await client.query('ROLLBACK');
            console.warn(`  ⚠️  ${emp.rfc} "${emp.nombre}" — ${err.message}`);
            omitidos++;
        } finally {
            client.release();
        }
    }

    console.log(`✅ Insertados: ${insertados} | Omitidos/Existentes: ${omitidos}`);
    await pool.end();
}

importar().catch(async err => {
    console.error('❌ Error fatal:', err.message);
    await pool.end();
    process.exit(1);
});
