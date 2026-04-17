import { Router } from 'express';
import {
    getGlobalAvisos,
    getAllAvisos,
    createAviso,
    updateAviso,
    deleteAviso,
    getAvisosPublicos
} from '../controllers/avisos.controller.js';
import { verificarAutenticacion } from '../middleware/auth.middleware.js';
import { verificarEmpresa } from '../middleware/tenant.middleware.js';

const router = Router();

// Todas las rutas siguientes requieren autenticación y contexto de empresa
router.use(verificarAutenticacion);
router.use(verificarEmpresa);

// Rutas protegidas (REQUERIAN AUTENTICACIÓN)
router.get('/publicos', getAvisosPublicos);

// Rutas para administración
router.get('/', getAllAvisos);
router.post('/', createAviso);
router.put('/:id', updateAviso);
router.delete('/:id', deleteAviso);

// Rutas para empleados (autenticadas)
router.get('/globales', getGlobalAvisos);

export default router;

