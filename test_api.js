import 'dotenv/config';
import { pool } from './src/config/db.js';

async function testEndpoint() {
    try {
        const empQuery = await pool.query(`
            SELECT e.id, u.empresa_id, ed.departamento_id, u.nombre 
            FROM empleados e 
            JOIN usuarios u ON e.usuario_id = u.id 
            LEFT JOIN empleados_departamentos ed ON ed.empleado_id = e.id AND ed.es_activo = true
            WHERE u.estado_cuenta = 'activo' 
            LIMIT 1
        `);
        if (empQuery.rows.length === 0) {
            console.log("No hay empleados activos para la prueba.");
            process.exit(0);
        }

        const empleado = empQuery.rows[0];
        console.log("Testeando con el empleado:", empleado.nombre, `(ID: ${empleado.id})`);

        // Llamamos al controlador de Registrar Asistencia
        // Simulamos el objeto request (req) y response (res) de Express
        const req = {
            body: {
                empleado_id: empleado.id,
                dispositivo_origen: 'movil',
                ubicacion: [20.659698, -103.349609], // Centro
                departamento_id: empleado.departamento_id
            },
            empresa_id: empleado.empresa_id,
            ip: '127.0.0.1'
        };

        const res = {
            status: function (code) {
                this.statusCode = code;
                return this;
            },
            json: function (data) {
                console.log(`\n✅ HTTP Status: ${this.statusCode}`);
                console.log("Respuesta:");
                console.log(JSON.stringify(data, null, 2));
            }
        };

        // Forzamos importación dinámica del controlador
        const { registrarAsistencia } = await import('./src/controllers/asistencias.controller.js');

        await registrarAsistencia(req, res);

    } catch (e) {
        console.error(e);
    } finally {
        process.exit(0);
    }
}

testEndpoint();
