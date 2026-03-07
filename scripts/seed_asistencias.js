import pg from 'pg';
import crypto from 'crypto';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

const { Pool } = pg;
const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
});

const randomInt = (min, max) => Math.floor(Math.random() * (max - min + 1) + min);
const randomElement = (arr) => arr[Math.floor(Math.random() * arr.length)];

async function run() {
    try {
        console.log("Obteniendo empleados activos...");
        const empRes = await pool.query(`
            SELECT DISTINCT ON (e.id)
                e.id as empleado_id, 
                ed.departamento_id, 
                u.empresa_id 
            FROM empleados e 
            JOIN usuarios u ON e.usuario_id = u.id
            LEFT JOIN empleados_departamentos ed ON e.id = ed.empleado_id AND ed.es_activo = true
            WHERE u.estado_cuenta = 'activo'
        `);
        const empleados = empRes.rows;

        if (empleados.length === 0) {
            console.log("No hay empleados en la BD.");
            process.exit(0);
        }

        console.log(`Se encontraron ${empleados.length} empleados. Generando datos desde Enero a Febrero de 2026...`);

        // Fechas deseadas: Enero 1, 2026 a Febrero 28, 2026
        // Dado que el sistema puede ser 2026 o el actual, ajustaremos a 2026.
        const startDate = new Date(2026, 0, 1); // Enero 1
        const endDate = new Date(2026, 1, 28);  // Febrero 28

        const tipos_entrada = ['puntual', 'retardo'];
        const dispositivos = ['movil', 'escritorio', 'sistema'];

        // Iterar día por día
        for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
            // Evitamos Domingos (opcional)
            if (d.getDay() === 0) continue;

            console.log(`Procesando día: ${d.toISOString().split('T')[0]}`);

            // Para cada empleado
            for (const emp of empleados) {
                // Probabilidad de que este día falte (10%)
                const isFalta = Math.random() < 0.10;

                if (isFalta) {
                    const idFalta = `asist_${crypto.randomUUID().replace(/-/g, '').substring(0, 16)}`;
                    // Simulamos a las 11 am que el cron les pone falta
                    const horaFalta = new Date(d);
                    horaFalta.setHours(11, 0, 0, 0);

                    await pool.query(
                        `INSERT INTO asistencias (id, estado, dispositivo_origen, empleado_id, departamento_id, empresa_id, fecha_registro)
                         VALUES ($1, 'falta', 'sistema', $2, $3, $4, $5)`,
                        [idFalta, emp.empleado_id, emp.departamento_id, emp.empresa_id, horaFalta]
                    );
                    continue;
                }

                // Generar Entrada entre 7:30 y 8:15 AM
                const horaEntrada = new Date(d);
                const minutosEntrada = randomInt(30, 75); // 7:30 a 8:15
                horaEntrada.setHours(7, minutosEntrada, 0, 0);

                const estadoEntrada = minutosEntrada <= 60 ? 'puntual' : 'retardo'; // asume 8:00 límite
                const idEntrada = `asist_${crypto.randomUUID().replace(/-/g, '').substring(0, 16)}`;

                await pool.query(
                    `INSERT INTO asistencias (id, estado, dispositivo_origen, empleado_id, departamento_id, tipo, empresa_id, fecha_registro, ubicacion)
                     VALUES ($1, $2, $3, $4, $5, 'entrada', $6, $7, null)`,
                    [idEntrada, estadoEntrada, randomElement(dispositivos), emp.empleado_id, emp.departamento_id, emp.empresa_id, horaEntrada]
                );

                // Probabilidad de no checar salida (5%)
                if (Math.random() < 0.05) continue;

                // Generar Salida entre 4:00 PM y 6:00 PM (16:00 a 18:00)
                const horaSalida = new Date(d);
                horaSalida.setHours(randomInt(16, 17), randomInt(0, 59), 0, 0);

                const idSalida = `asist_${crypto.randomUUID().replace(/-/g, '').substring(0, 16)}`;
                await pool.query(
                    `INSERT INTO asistencias (id, estado, dispositivo_origen, empleado_id, departamento_id, tipo, empresa_id, fecha_registro, ubicacion)
                     VALUES ($1, 'salida', $2, $3, $4, 'salida', $5, $6, null)`,
                    [idSalida, randomElement(dispositivos), emp.empleado_id, emp.departamento_id, emp.empresa_id, horaSalida]
                );
            }
        }

        console.log("¡Llenado de datos completado exitosamente!");
        process.exit(0);

    } catch (err) {
        console.error("Ocurrió un error:", err);
        process.exit(1);
    }
}

run();
