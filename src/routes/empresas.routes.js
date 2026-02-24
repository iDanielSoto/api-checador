import { Router } from 'express';
import { getEmpresas, getEmpresaById, createEmpresa, updateEmpresa, deleteEmpresa, getEmpresaPublicaById, getEmpresaPublicaByIdentificador, getMiEmpresa, updateMiEmpresa } from '../controllers/empresas.controller.js';
import { verificarAutenticacion } from '../middleware/auth.middleware.js';
import { verificarEmpresa, requireSaaSOwner } from '../middleware/tenant.middleware.js';

const router = Router();
// Rutas públicas para listar info basica de una empresa (necesarias para el login multi-tenant o solicitudes externas)
router.get('/public/:id', getEmpresaPublicaById);
router.get('/identificador/:slug', getEmpresaPublicaByIdentificador);

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
