import { Router } from 'express';
import { getConfiguracion, getConfiguracionById, updateConfiguracion, toggleMantenimiento, getMantenimientoStatus } from '../controllers/configuracion.controller.js';
import { verificarAutenticacion } from '../middleware/auth.middleware.js';
import { requirePermiso } from '../middleware/permissions.middleware.js';

const router = Router();

// Ruta PUBLICA para verificar estado (sin autenticación)
router.get('/public/status', getMantenimientoStatus);

router.use(verificarAutenticacion);

router.get('/', requirePermiso('CONFIGURACION_VER'), getConfiguracion);
router.get('/:id', requirePermiso('CONFIGURACION_VER'), getConfiguracionById);
router.put('/:id', requirePermiso('CONFIGURACION_MODIFICAR'), updateConfiguracion);
router.patch('/:id/mantenimiento', requirePermiso('CONFIGURACION_MODIFICAR'), toggleMantenimiento);

export default router;
