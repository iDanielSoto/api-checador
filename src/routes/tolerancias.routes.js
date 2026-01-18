import { Router } from 'express';
import {
    getTolerancias,
    getToleranciaById,
    createTolerancia,
    updateTolerancia,
    deleteTolerancia
} from '../controllers/tolerancias.controller.js';
import { verificarAutenticacion } from '../middleware/auth.middleware.js';
import { requirePermiso } from '../middleware/permissions.middleware.js';

const router = Router();

router.use(verificarAutenticacion);

router.get('/', requirePermiso('HORARIO_VER'), getTolerancias);
router.get('/:id', requirePermiso('HORARIO_VER'), getToleranciaById);
router.post('/', requirePermiso('HORARIO_CREAR'), createTolerancia);
router.put('/:id', requirePermiso('HORARIO_MODIFICAR'), updateTolerancia);
router.delete('/:id', requirePermiso('HORARIO_SOFTDELETE'), deleteTolerancia);

export default router;
