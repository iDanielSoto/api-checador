import { Router } from 'express';
import {
    getModulos,
    getModulosMenu,
    getModuloById,
    createModulo,
    updateModulo,
    deleteModulo
} from '../controllers/modulos.controller.js';
import { requirePermiso } from '../middleware/permissions.middleware.js';
import { verificarAutenticacion, autenticacionOpcional } from '../middleware/auth.middleware.js';

const router = Router();

// Rutas públicas (para el menú, filtra según permisos del usuario)
router.get('/menu', verificarAutenticacion, getModulosMenu);

// Rutas con autenticación básica
router.get('/', verificarAutenticacion, getModulos);
router.get('/:id', verificarAutenticacion, getModuloById);

// Rutas protegidas (solo admins con acceso a configuración pueden intentar modificar módulos)
router.post('/', verificarAutenticacion, requirePermiso('CONFIG_GENERAL'), createModulo);
router.put('/:id', verificarAutenticacion, requirePermiso('CONFIG_GENERAL'), updateModulo);
router.delete('/:id', verificarAutenticacion, requirePermiso('CONFIG_GENERAL'), deleteModulo);

export default router;

