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

export default router;
