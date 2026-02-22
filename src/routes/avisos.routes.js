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

const router = Router();

// Rutas públicas (sin autenticación)
router.get('/publicos', getAvisosPublicos);

// Todas las rutas siguientes requieren autenticación
router.use(verificarAutenticacion);

// Rutas para administración
router.get('/', getAllAvisos);
router.post('/', createAviso);
router.put('/:id', updateAviso);
router.delete('/:id', deleteAviso);

// Rutas para empleados (autenticadas)
router.get('/globales', getGlobalAvisos);

export default router;
