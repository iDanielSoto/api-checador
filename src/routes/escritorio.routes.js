import { Router } from 'express';
import {
    getEscritorios,
    getEscritorioById,
    createEscritorio,
    updateEscritorio,
    deleteEscritorio
} from '../controllers/escritorio.controller.js';
import { verificarAutenticacion } from '../middleware/auth.middleware.js';
import { requirePermiso } from '../middleware/permissions.middleware.js';

const router = Router();

router.use(verificarAutenticacion);

router.get('/', requirePermiso('DISPOSITIVO_VER'), getEscritorios);
router.get('/:id', requirePermiso('DISPOSITIVO_VER'), getEscritorioById);
router.post('/', requirePermiso('DISPOSITIVO_CREAR'), createEscritorio);
router.put('/:id', requirePermiso('DISPOSITIVO_MODIFICAR'), updateEscritorio);
router.delete('/:id', requirePermiso('DISPOSITIVO_MODIFICAR'), deleteEscritorio);

export default router;
