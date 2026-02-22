import { Router } from 'express';
import { getEventos, getEventoById, createEvento, getEventosRecientes, getStatsEventos } from '../controllers/eventos.controller.js';
import { verificarAutenticacion } from '../middleware/auth.middleware.js';
import { verificarEmpresa } from '../middleware/tenant.middleware.js';
import { requirePermiso } from '../middleware/permissions.middleware.js';

const router = Router();
router.use(verificarAutenticacion);
router.use(verificarEmpresa);

router.get('/recientes', requirePermiso('REGISTRO_VER'), getEventosRecientes);
router.get('/stats', requirePermiso('REGISTRO_VER'), getStatsEventos);
router.get('/', requirePermiso('REGISTRO_VER'), getEventos);
router.get('/:id', requirePermiso('REGISTRO_VER'), getEventoById);
router.post('/', requirePermiso('REGISTRO_VER'), createEvento);

export default router;
