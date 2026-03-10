import { registrarAsistencia } from './asistencias.controller.js';
import { pool } from '../config/db.js';

export async function sincronizarRawPunch(req, res) {
    try {
        const { registros } = req.body;

        // Validar que se ha mandado un array
        if (!registros || !Array.isArray(registros)) {
            return res.status(400).json({ success: false, message: 'Se esperaba un arreglo de registros' });
        }

        const sincronizados = [];
        const rechazados = [];

        for (const registro of registros) {
            // Verificar primero en DB si el usuario está inactivo o borrado para no colapsar la lógica principal
            const empleadoCheck = await pool.query(`
                SELECT e.id, u.empresa_id FROM empleados e
                INNER JOIN usuarios u ON u.id = e.usuario_id
                WHERE e.id = $1 AND u.estado_cuenta = 'activo'
            `, [registro.empleado_id]);

            if (empleadoCheck.rows.length === 0) {
                rechazados.push({ id_local: registro.id, error: 'Empleado no encontrado o inactivo' });
                continue;
            }

            // SIMULAR o INYECTAR la petición HTTP local normal hacia la función madre
            const mockReq = {
                body: {
                    empleado_id: registro.empleado_id,
                    dispositivo_origen: 'escritorio',
                    fecha_captura: registro.fecha_captura,
                    metodo: registro.metodo
                },
                empresa_id: empleadoCheck.rows[0].empresa_id,
                ip: req.ip // Pasamos la IP original por si se necesita
            };

            // Simular objeto RES para capturar si falló (ej. 'Ya tiene entrada') o si fue un éxito (201)
            let capturedResponseStatus = 200;
            let capturedResponseData = null;

            const mockRes = {
                status: function (code) { capturedResponseStatus = code; return this; },
                json: function (data) { capturedResponseData = data; return this; }
            };

            await registrarAsistencia(mockReq, mockRes);

            // Si la asistencia fue validada y persistida sin problemas...
            if (capturedResponseStatus === 201 || (capturedResponseData && capturedResponseData.success)) {
                sincronizados.push({ id_local: registro.id, mensaje: 'Sincronizado' });
            } else {
                rechazados.push({ id_local: registro.id, error: capturedResponseData?.message || 'Error desconocido' });
            }
        }

        // Devolver un resumen para que el Kiosco borre de su memoria SQLite lo que se logró sincronizar y lo que causó error de validación definitiva.
        res.json({ success: true, sincronizados, rechazados });

    } catch (error) {
        console.error("Error en sincronizarRawPunch:", error);
        res.status(500).json({ success: false, error: 'Error general en sync', message: error.message });
    }
}
