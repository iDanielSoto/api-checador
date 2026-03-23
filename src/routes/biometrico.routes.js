import { Router } from 'express';
import {
    getBiometricos,
    getBiometricoById,
    createBiometrico,
    updateBiometrico,
    updateEstadoBiometrico,
    deleteBiometrico,
    getStatsBiometrico,
    syncBiometricoStatus
} from '../controllers/biometrico.controller.js';
import { verificarAutenticacion } from '../middleware/auth.middleware.js';
import { verificarEmpresa } from '../middleware/tenant.middleware.js';
import { requirePermiso } from '../middleware/permissions.middleware.js';
import pool from '../config/db.js';

const router = Router();

// ==========================================
// RUTAS PÚBLICAS (USADAS POR EL KIOSKO EN C#)
// ==========================================

router.post('/sync-status', syncBiometricoStatus);
router.patch('/:id/estado', updateEstadoBiometrico);
router.get('/', getBiometricos);

router.get('/escritorio/:escritorioId', async (req, res) => {
    try {
        const { escritorioId } = req.params;
        console.log("=== LLAMANDO A GET BIOMETRICO POR ESCRITORIO ===");
        console.log("escritorioId recibido:", escritorioId);
        const query = `
      SELECT id, nombre, tipo, puerto, ip, estado, es_activo, escritorio_id, device_id 
      FROM biometrico 
      WHERE escritorio_id = $1
    `;
        const result = await pool.query(query, [escritorioId]);
        return res.json({ success: true, data: result.rows });
    } catch (error) {
        console.error('Error:', error);
        return res.status(500).json({ success: false, message: error.message });
    }
});

// ==========================================
// RUTAS ADMINISTRATIVAS PROTEGIDAS
// ==========================================

router.use(verificarAutenticacion);
router.use(verificarEmpresa);

router.get('/stats', requirePermiso('DISPOSITIVO_VER'), getStatsBiometrico);
router.get('/:id', requirePermiso('DISPOSITIVO_VER'), getBiometricoById);
router.post('/', requirePermiso('DISPOSITIVO_CREAR'), createBiometrico);
router.put('/:id', requirePermiso('DISPOSITIVO_MODIFICAR'), updateBiometrico);
router.delete('/:id', requirePermiso('DISPOSITIVO_MODIFICAR'), deleteBiometrico);


export default router;
