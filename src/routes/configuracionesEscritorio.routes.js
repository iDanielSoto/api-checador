import express from 'express';
import { verificarAutenticacion } from '../middleware/auth.middleware.js';
import { requirePermiso } from '../middleware/permissions.middleware.js';
import {
    getConfiguracionEscritorio,
    updateConfiguracionEscritorio
} from '../controllers/configuracionesEscritorio.controller.js';

const router = express.Router();

// Todas las rutas requieren estar autenticado
router.use(verificarAutenticacion);

// Solo usuarios con permisos pueden ver o modificar estas configuraciones
router.get('/:escritorio_id', requirePermiso('DISPOSITIVO_MODIFICAR'), getConfiguracionEscritorio);
router.put('/:escritorio_id', requirePermiso('DISPOSITIVO_MODIFICAR'), updateConfiguracionEscritorio);

export default router;
