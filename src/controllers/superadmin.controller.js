import { pool } from '../config/db.js';
import bcrypt from 'bcrypt';

/**
 * POST /api/super-administradores
 * Sólo accesible por Dueños SaaS (Propietarios)
 */
export async function createSuperAdmin(req, res) {
    try {
        const { usuario, correo, contraseña, nombre } = req.body;

        if (!usuario || !correo || !contraseña || !nombre) {
            return res.status(400).json({
                success: false,
                message: 'Todos los campos son requeridos (usuario, correo, contraseña, nombre)'
            });
        }

        // Encriptar la contraseña
        const hash = await bcrypt.hash(contraseña, 10);
        const adminId = 'saas_' + Date.now();

        const resultado = await pool.query(`
            INSERT INTO super_administradores (id, usuario, correo, contraseña, nombre)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING id, usuario, correo, nombre, estado_cuenta, fecha_registro
        `, [adminId, usuario, correo, hash, nombre]);

        res.status(201).json({
            success: true,
            message: 'Super Administrador (SaaS) creado correctamente',
            data: resultado.rows[0]
        });
    } catch (error) {
        console.error('Error al crear super administrador:', error);

        // Manejar errores de unique constraint
        if (error.code === '23505') {
            return res.status(400).json({
                success: false,
                message: 'El usuario o el correo ya están registrados en el sistema Maestro.'
            });
        }

        res.status(500).json({
            success: false,
            message: 'Error interno al crear el administrador'
        });
    }
}
