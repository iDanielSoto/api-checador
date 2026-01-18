import { Router } from 'express';
import { getEmpresas, getEmpresaById, createEmpresa, updateEmpresa, deleteEmpresa } from '../controllers/empresas.controller.js';
import { verificarAutenticacion } from '../middleware/auth.middleware.js';
import { requirePermiso } from '../middleware/permissions.middleware.js';

const router = Router();
router.use(verificarAutenticacion);

router.get('/', requirePermiso('CONFIGURACION_VER'), getEmpresas);
router.get('/:id', requirePermiso('CONFIGURACION_VER'), getEmpresaById);
router.post('/', requirePermiso('CONFIGURACION_MODIFICAR'), createEmpresa);
router.put('/:id', requirePermiso('CONFIGURACION_MODIFICAR'), updateEmpresa);
router.delete('/:id', requirePermiso('CONFIGURACION_MODIFICAR'), deleteEmpresa);

export default router;
