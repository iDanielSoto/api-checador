import { Router } from 'express';
import {
    getGlobalAvisos,
    getAllAvisos,
    createAviso,
    updateAviso,
    deleteAviso
} from '../controllers/avisos.controller.js';
import { verificarAutenticacion } from '../middleware/auth.middleware.js';

const router = Router();

// Todas las rutas requieren autenticación
router.use(verificarAutenticacion);

// Rutas para administración
router.get('/', getAllAvisos);
router.post('/', createAviso);
router.put('/:id', updateAviso);
router.delete('/:id', deleteAviso);

// Rutas públicas/empleados
router.get('/globales', getGlobalAvisos);

export default router;
