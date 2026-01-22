import { pool } from '../config/db.js';
import { generateId, ID_PREFIXES } from '../utils/idGenerator.js';

export async function getCredenciales(req, res) {
    try {
        const resultado = await pool.query(`
            SELECT c.id, c.empleado_id, c.fecha_registro,
                CASE WHEN c.dactilar IS NOT NULL THEN true ELSE false END as tiene_dactilar,
                CASE WHEN c.facial IS NOT NULL THEN true ELSE false END as tiene_facial,
                CASE WHEN c.pin IS NOT NULL THEN true ELSE false END as tiene_pin,
                u.nombre as empleado_nombre
            FROM credenciales c
            INNER JOIN empleados e ON e.id = c.empleado_id
            INNER JOIN usuarios u ON u.id = e.usuario_id
            ORDER BY c.fecha_registro DESC
        `);
        res.json({ success: true, data: resultado.rows });
    } catch (error) {
        console.error('Error en getCredenciales:', error);
        res.status(500).json({ success: false, message: 'Error al obtener credenciales' });
    }
}

export async function getCredencialesByEmpleado(req, res) {
    try {
        const { empleadoId } = req.params;
        const resultado = await pool.query(`
            SELECT id, empleado_id, fecha_registro,
                CASE WHEN dactilar IS NOT NULL THEN true ELSE false END as tiene_dactilar,
                CASE WHEN facial IS NOT NULL THEN true ELSE false END as tiene_facial,
                CASE WHEN pin IS NOT NULL THEN true ELSE false END as tiene_pin
            FROM credenciales WHERE empleado_id = $1
        `, [empleadoId]);
        if (resultado.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Credenciales no encontradas' });
        }
        res.json({ success: true, data: resultado.rows[0] });
    } catch (error) {
        console.error('Error en getCredencialesByEmpleado:', error);
        res.status(500).json({ success: false, message: 'Error al obtener credenciales' });
    }
}

export async function guardarDactilar(req, res) {
    try {
        const { empleado_id, dactilar } = req.body;
        if (!empleado_id || !dactilar) {
            return res.status(400).json({ success: false, message: 'empleado_id y dactilar son requeridos' });
        }
        const existe = await pool.query('SELECT id FROM credenciales WHERE empleado_id = $1', [empleado_id]);
        if (existe.rows.length > 0) {
            await pool.query('UPDATE credenciales SET dactilar = $1 WHERE empleado_id = $2', [Buffer.from(dactilar, 'base64'), empleado_id]);
        } else {
            const id = await generateId(ID_PREFIXES.CREDENCIAL);
            await pool.query('INSERT INTO credenciales (id, empleado_id, dactilar) VALUES ($1, $2, $3)', [id, empleado_id, Buffer.from(dactilar, 'base64')]);
        }
        res.json({ success: true, message: 'Huella dactilar guardada' });
    } catch (error) {
        console.error('Error en guardarDactilar:', error);
        res.status(500).json({ success: false, message: 'Error al guardar huella' });
    }
}

export async function guardarFacial(req, res) {
    try {
        const { empleado_id, facial } = req.body;
        if (!empleado_id || !facial) {
            return res.status(400).json({ success: false, message: 'empleado_id y facial son requeridos' });
        }
        const existe = await pool.query('SELECT id FROM credenciales WHERE empleado_id = $1', [empleado_id]);
        if (existe.rows.length > 0) {
            await pool.query('UPDATE credenciales SET facial = $1 WHERE empleado_id = $2', [Buffer.from(facial, 'base64'), empleado_id]);
        } else {
            const id = await generateId(ID_PREFIXES.CREDENCIAL);
            await pool.query('INSERT INTO credenciales (id, empleado_id, facial) VALUES ($1, $2, $3)', [id, empleado_id, Buffer.from(facial, 'base64')]);
        }
        res.json({ success: true, message: 'Datos faciales guardados' });
    } catch (error) {
        console.error('Error en guardarFacial:', error);
        res.status(500).json({ success: false, message: 'Error al guardar datos faciales' });
    }
}

export async function guardarPin(req, res) {
    try {
        const { empleado_id, pin } = req.body;
        if (!empleado_id || !pin) {
            return res.status(400).json({ success: false, message: 'empleado_id y pin son requeridos' });
        }
        if (pin.length !== 6 || !/^\d+$/.test(pin)) {
            return res.status(400).json({ success: false, message: 'El PIN debe ser de 6 dígitos' });
        }
        const existe = await pool.query('SELECT id FROM credenciales WHERE empleado_id = $1', [empleado_id]);
        if (existe.rows.length > 0) {
            await pool.query('UPDATE credenciales SET pin = $1 WHERE empleado_id = $2', [pin, empleado_id]);
        } else {
            const id = await generateId(ID_PREFIXES.CREDENCIAL);
            await pool.query('INSERT INTO credenciales (id, empleado_id, pin) VALUES ($1, $2, $3)', [id, empleado_id, pin]);
        }
        res.json({ success: true, message: 'PIN guardado' });
    } catch (error) {
        console.error('Error en guardarPin:', error);
        res.status(500).json({ success: false, message: 'Error al guardar PIN' });
    }
}

export async function verificarPin(req, res) {
    try {
        const { empleado_id, pin } = req.body;
        const resultado = await pool.query('SELECT pin FROM credenciales WHERE empleado_id = $1', [empleado_id]);
        if (resultado.rows.length === 0 || !resultado.rows[0].pin) {
            return res.status(404).json({ success: false, message: 'PIN no configurado' });
        }
        const valido = resultado.rows[0].pin === pin;
        res.json({ success: true, data: { valido } });
    } catch (error) {
        console.error('Error en verificarPin:', error);
        res.status(500).json({ success: false, message: 'Error al verificar PIN' });
    }
}

export async function eliminarCredencial(req, res) {
    try {
        const { empleadoId } = req.params;
        const { tipo } = req.query;
        if (tipo === 'todo') {
            await pool.query('DELETE FROM credenciales WHERE empleado_id = $1', [empleadoId]);
        } else if (['dactilar', 'facial', 'pin'].includes(tipo)) {
            await pool.query(`UPDATE credenciales SET ${tipo} = NULL WHERE empleado_id = $1`, [empleadoId]);
        } else {
            return res.status(400).json({ success: false, message: 'tipo inválido' });
        }
        res.json({ success: true, message: 'Credencial eliminada' });
    } catch (error) {
        console.error('Error en eliminarCredencial:', error);
        res.status(500).json({ success: false, message: 'Error al eliminar credencial' });
    }
}

// ========== ENDPOINTS PÚBLICOS (sin autenticación) ==========
// Obtener lista de credenciales con huella dactilar
export async function getCredencialesPublico(req, res) {
    try {
        const resultado = await pool.query(`
            SELECT c.id, c.empleado_id,
                CASE WHEN c.dactilar IS NOT NULL THEN true ELSE false END as tiene_dactilar,
                CASE WHEN c.facial IS NOT NULL THEN true ELSE false END as tiene_facial,
                CASE WHEN c.pin IS NOT NULL THEN true ELSE false END as tiene_pin
            FROM credenciales c
            WHERE c.dactilar IS NOT NULL
        `);
        res.json({ success: true, data: resultado.rows });
    } catch (error) {
        console.error('Error en getCredencialesPublico:', error);
        res.status(500).json({ success: false, message: 'Error al obtener credenciales' });
    }
}

// Obtener huella dactilar de un empleado específico
export async function getDactilarByEmpleado(req, res) {
    try {
        const { empleadoId } = req.params;
        const resultado = await pool.query(
            'SELECT dactilar FROM credenciales WHERE empleado_id = $1',
            [empleadoId]
        );

        if (resultado.rows.length === 0 || !resultado.rows[0].dactilar) {
            return res.status(404).json({ success: false, message: 'Huella no encontrada' });
        }

        const dactilarBase64 = resultado.rows[0].dactilar.toString('base64');

        res.json({
            success: true,
            data: { dactilar: dactilarBase64 }
        });
    } catch (error) {
        console.error('Error en getDactilarByEmpleado:', error);
        res.status(500).json({ success: false, message: 'Error al obtener huella' });
    }
}