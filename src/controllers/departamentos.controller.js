import { pool } from '../config/db.js';
import { generateId, ID_PREFIXES } from '../utils/idGenerator.js';
import { registrarEvento, TIPOS_EVENTO, PRIORIDADES } from '../utils/eventos.js';

export async function getDepartamentos(req, res) {
    try {
        const { es_activo } = req.query;
        let query = `
            SELECT d.*,
                (SELECT COUNT(*) FROM empleados_departamentos ed WHERE ed.departamento_id = d.id AND ed.es_activo = true) as empleados_count
            FROM departamentos d WHERE 1=1
        `;
        const params = [];
        if (es_activo !== undefined) {
            query += ` AND d.es_activo = $1`;
            params.push(es_activo === 'true');
        }
        query += ` ORDER BY d.nombre ASC`;
        const resultado = await pool.query(query, params);
        res.json({ success: true, data: resultado.rows });
    } catch (error) {
        console.error('Error en getDepartamentos:', error);
        res.status(500).json({ success: false, message: 'Error al obtener departamentos' });
    }
}

export async function getDepartamentoById(req, res) {
    try {
        const { id } = req.params;
        const resultado = await pool.query('SELECT * FROM departamentos WHERE id = $1', [id]);
        if (resultado.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Departamento no encontrado' });
        }
        const empleados = await pool.query(`
            SELECT e.id, u.nombre, u.correo, u.foto
            FROM empleados e
            INNER JOIN usuarios u ON u.id = e.usuario_id
            INNER JOIN empleados_departamentos ed ON ed.empleado_id = e.id
            WHERE ed.departamento_id = $1 AND ed.es_activo = true
        `, [id]);
        res.json({ success: true, data: { ...resultado.rows[0], empleados: empleados.rows } });
    } catch (error) {
        console.error('Error en getDepartamentoById:', error);
        res.status(500).json({ success: false, message: 'Error al obtener departamento' });
    }
}

export async function createDepartamento(req, res) {
    try {
        const { nombre, descripcion, ubicacion, jefes, color } = req.body;
        if (!nombre) {
            return res.status(400).json({ success: false, message: 'El nombre es requerido' });
        }
        const id = await generateId(ID_PREFIXES.DEPARTAMENTO);
        const resultado = await pool.query(`
            INSERT INTO departamentos (id, nombre, descripcion, ubicacion, jefes, color, es_activo)
            VALUES ($1, $2, $3, $4, $5, $6, true) RETURNING *
        `, [
            id,
            nombre,
            descripcion,
            ubicacion || null,
            jefes || null,
            color
        ]);
        // Registrar evento
        await registrarEvento({
            titulo: 'Departamento creado',
            descripcion: `Se creó el departamento "${nombre}"`,
            tipo_evento: TIPOS_EVENTO.DEPARTAMENTO,
            prioridad: PRIORIDADES.MEDIA,
            usuario_modificador_id: req.usuario?.id,
            detalles: { departamento_id: id, nombre }
        });

        res.status(201).json({ success: true, message: 'Departamento creado', data: resultado.rows[0] });
    } catch (error) {
        console.error('Error en createDepartamento:', error);
        res.status(500).json({ success: false, message: 'Error al crear departamento' });
    }
}

export async function updateDepartamento(req, res) {
    try {
        const { id } = req.params;
        const { nombre, descripcion, ubicacion, jefes, color, es_activo } = req.body;
        const resultado = await pool.query(`
            UPDATE departamentos SET
                nombre = COALESCE($1, nombre), descripcion = COALESCE($2, descripcion),
                ubicacion = COALESCE($3, ubicacion), jefes = COALESCE($4, jefes),
                color = COALESCE($5, color), es_activo = COALESCE($6, es_activo)
            WHERE id = $7 RETURNING *
        `, [
            nombre,
            descripcion,
            ubicacion !== undefined ? ubicacion : null,
            jefes !== undefined ? jefes : null,
            color,
            es_activo,
            id
        ]);
        if (resultado.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Departamento no encontrado' });
        }

        // Registrar evento
        await registrarEvento({
            titulo: 'Departamento actualizado',
            descripcion: `Se actualizó el departamento "${resultado.rows[0].nombre}"`,
            tipo_evento: TIPOS_EVENTO.DEPARTAMENTO,
            prioridad: PRIORIDADES.BAJA,
            usuario_modificador_id: req.usuario?.id,
            detalles: { departamento_id: id, cambios: req.body }
        });

        res.json({ success: true, message: 'Departamento actualizado', data: resultado.rows[0] });
    } catch (error) {
        console.error('Error en updateDepartamento:', error);
        res.status(500).json({ success: false, message: 'Error al actualizar departamento' });
    }
}

export async function deleteDepartamento(req, res) {
    try {
        const { id } = req.params;
        const resultado = await pool.query(`
            UPDATE departamentos SET es_activo = false WHERE id = $1 AND es_activo = true RETURNING id
        `, [id]);
        if (resultado.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Departamento no encontrado' });
        }

        // Registrar evento
        await registrarEvento({
            titulo: 'Departamento desactivado',
            descripcion: `Se desactivó el departamento con ID ${id}`,
            tipo_evento: TIPOS_EVENTO.DEPARTAMENTO,
            prioridad: PRIORIDADES.ALTA,
            usuario_modificador_id: req.usuario?.id,
            detalles: { departamento_id: id }
        });

        res.json({ success: true, message: 'Departamento desactivado' });
    } catch (error) {
        console.error('Error en deleteDepartamento:', error);
        res.status(500).json({ success: false, message: 'Error al desactivar departamento' });
    }
}
