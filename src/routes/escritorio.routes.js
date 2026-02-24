import { Router } from 'express';
import {
    getEscritorios,
    getEscritorioById,
    createEscritorio,
    updateEscritorio,
    deleteEscritorio,
    reactivarEscritorio,
    desvincularEscritorioLocal
} from '../controllers/escritorio.controller.js';
import { verificarAutenticacion } from '../middleware/auth.middleware.js';
import { verificarEmpresa } from '../middleware/tenant.middleware.js';
import { requirePermiso } from '../middleware/permissions.middleware.js';

const router = Router();

// Ruta pública para desvinculación local (usa token de solicitud, no requiere JWT admin)
router.post('/:id/desvincular', desvincularEscritorioLocal);

router.use(verificarAutenticacion);
router.use(verificarEmpresa);

router.get('/', requirePermiso('DISPOSITIVO_VER'), getEscritorios);
router.get('/:id', requirePermiso('DISPOSITIVO_VER'), getEscritorioById);
router.post('/', requirePermiso('DISPOSITIVO_CREAR'), createEscritorio);
router.put('/:id', requirePermiso('DISPOSITIVO_MODIFICAR'), updateEscritorio);
router.delete('/:id', requirePermiso('DISPOSITIVO_MODIFICAR'), deleteEscritorio);
router.patch('/:id/reactivar', requirePermiso('DISPOSITIVO_MODIFICAR'), reactivarEscritorio);

export default router;
