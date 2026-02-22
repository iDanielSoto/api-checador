import { Router } from 'express';
import {
    getHorarios,
    getHorarioById,
    createHorario,
    updateHorario,
    deleteHorario,
    reactivarHorario,
    asignarHorario
} from '../controllers/horarios.controller.js';
import { verificarAutenticacion } from '../middleware/auth.middleware.js';
import { verificarEmpresa } from '../middleware/tenant.middleware.js';
import { requirePermiso } from '../middleware/permissions.middleware.js';

const router = Router();

router.use(verificarAutenticacion);
router.use(verificarEmpresa);

router.get('/', requirePermiso('HORARIO_VER'), getHorarios);
router.get('/:id', requirePermiso('HORARIO_VER'), getHorarioById);
router.post('/', requirePermiso('HORARIO_CREAR'), createHorario);
router.put('/:id', requirePermiso('HORARIO_MODIFICAR'), updateHorario);
router.delete('/:id', requirePermiso('HORARIO_SOFTDELETE'), deleteHorario);
router.patch('/:id/reactivar', requirePermiso('HORARIO_MODIFICAR'), reactivarHorario);
router.post('/:id/asignar', requirePermiso('HORARIO_ASIGNAR'), asignarHorario);

export default router;
