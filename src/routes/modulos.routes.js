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
router.get('/menu', autenticacionOpcional, getModulosMenu);

// Rutas con autenticación básica
router.get('/', verificarAutenticacion, getModulos);
router.get('/:id', verificarAutenticacion, getModuloById);

// Rutas protegidas (solo admins pueden modificar módulos)
router.post('/', verificarAutenticacion, requirePermiso('SUPER_ADMIN'), createModulo);
router.put('/:id', verificarAutenticacion, requirePermiso('SUPER_ADMIN'), updateModulo);
router.delete('/:id', verificarAutenticacion, requirePermiso('SUPER_ADMIN'), deleteModulo);

export default router;
