import { Router } from 'express';
import {
    getBiometricos,
    getBiometricoById,
    createBiometrico,
    updateBiometrico,
    updateEstadoBiometrico,
    deleteBiometrico,
    getStatsBiometrico
} from '../controllers/biometrico.controller.js';
import { verificarAutenticacion } from '../middleware/auth.middleware.js';
import { requirePermiso } from '../middleware/permissions.middleware.js';
import pool from '../config/db.js';

const router = Router();

router.use(verificarAutenticacion);

// Rutas específicas primero
router.get('/stats', requirePermiso('DISPOSITIVO_VER'), getStatsBiometrico);

router.get('/', requirePermiso('DISPOSITIVO_VER'), getBiometricos);
router.get('/:id', requirePermiso('DISPOSITIVO_VER'), getBiometricoById);
router.post('/', requirePermiso('DISPOSITIVO_CREAR'), createBiometrico);
router.put('/:id', requirePermiso('DISPOSITIVO_MODIFICAR'), updateBiometrico);
router.patch('/:id/estado', requirePermiso('DISPOSITIVO_MODIFICAR'), updateEstadoBiometrico);
router.delete('/:id', requirePermiso('DISPOSITIVO_MODIFICAR'), deleteBiometrico);
router.get('/escritorio/:escritorioId', async (req, res) => {
    try {
        const { escritorioId } = req.params;

        const query = `
      SELECT id, nombre, tipo, puerto, ip, estado, es_activo, escritorio_id 
      FROM biometrico 
      WHERE escritorio_id = $1
    `;

        const result = await pool.query(query, [escritorioId]);

        return res.json({
            success: true,
            data: result.rows
        });

    } catch (error) {
        console.error('Error:', error);
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

export default router;
