import { Router } from 'express';
import { getEmpresas, getEmpresaById, createEmpresa, updateEmpresa, deleteEmpresa, getEmpresaPublicaById, getMiEmpresa, updateMiEmpresa } from '../controllers/empresas.controller.js';
import { verificarAutenticacion } from '../middleware/auth.middleware.js';
import { verificarEmpresa, requireSaaSOwner } from '../middleware/tenant.middleware.js';

const router = Router();
// Ruta pública para listar info basica de una empresa (necesaria para el login multi-tenant)
router.get('/public/:id', getEmpresaPublicaById);

// Rutas para que el tenant admin gestione SU PROPIA empresa
router.get('/mi-empresa', verificarAutenticacion, verificarEmpresa, getMiEmpresa);
router.put('/mi-empresa', verificarAutenticacion, verificarEmpresa, updateMiEmpresa);

router.use(verificarAutenticacion);
router.use(requireSaaSOwner); // <-- Barrera absoluta. Solo dueños SaaS cruzan de aqui en adelante.

router.get('/', getEmpresas);
router.get('/:id', getEmpresaById);
router.post('/', createEmpresa);
router.put('/:id', updateEmpresa);
router.delete('/:id', deleteEmpresa);

export default router;
