import { Router } from 'express';
import { getConfiguracion, getConfiguracionById, updateConfiguracion, toggleMantenimiento, getMantenimientoStatus } from '../controllers/configuracion.controller.js';
import { verificarAutenticacion } from '../middleware/auth.middleware.js';
import { requirePermiso } from '../middleware/permissions.middleware.js';

const router = Router();

// Ruta PUBLICA para verificar estado (sin autenticación)
router.get('/public/status', getMantenimientoStatus);

router.use(verificarAutenticacion);

router.get('/', requirePermiso('CONFIG_VER'), getConfiguracion);
router.get('/:id', requirePermiso('CONFIG_VER'), getConfiguracionById);
router.put('/:id', requirePermiso('CONFIG_GENERAL'), updateConfiguracion);
router.patch('/:id/mantenimiento', requirePermiso('CONFIG_GENERAL'), toggleMantenimiento);

export default router;

