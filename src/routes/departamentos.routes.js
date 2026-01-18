import { Router } from 'express';
import { getDepartamentos, getDepartamentoById, createDepartamento, updateDepartamento, deleteDepartamento } from '../controllers/departamentos.controller.js';
import { verificarAutenticacion } from '../middleware/auth.middleware.js';
import { requirePermiso } from '../middleware/permissions.middleware.js';

const router = Router();
router.use(verificarAutenticacion);

router.get('/', requirePermiso('DEPARTAMENTO_VER'), getDepartamentos);
router.get('/:id', requirePermiso('DEPARTAMENTO_VER'), getDepartamentoById);
router.post('/', requirePermiso('DEPARTAMENTO_CREAR'), createDepartamento);
router.put('/:id', requirePermiso('DEPARTAMENTO_MODIFICAR'), updateDepartamento);
router.delete('/:id', requirePermiso('DEPARTAMENTO_SOFTDELETE'), deleteDepartamento);

export default router;
