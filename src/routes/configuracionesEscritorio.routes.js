import express from 'express';
import { verificarAutenticacion } from '../middleware/auth.middleware.js';
import { requirePermiso } from '../middleware/permissions.middleware.js';
import {
    getConfiguracionEscritorio,
    updateConfiguracionEscritorio
} from '../controllers/configuracionesEscritorio.controller.js';

const router = express.Router();

// Ruta pública para que el escritorio obtenga su configuración sin token
router.get('/:escritorio_id', getConfiguracionEscritorio);

// Las siguientes rutas requieren estar autenticado
router.use(verificarAutenticacion);

// Solo usuarios con permisos pueden modificar estas configuraciones
router.put('/:escritorio_id', requirePermiso('DISPOSITIVO_MODIFICAR'), updateConfiguracionEscritorio);

export default router;
