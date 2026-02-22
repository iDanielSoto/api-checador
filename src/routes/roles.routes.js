import { Router } from 'express';
import {
    getRoles,
    getRolById,
    createRol,
    updateRol,
    deleteRol,
    reactivarRol,
    getPermisosCatalogo,
    getUsuariosConRol
} from '../controllers/roles.controller.js';
import { verificarAutenticacion } from '../middleware/auth.middleware.js';
import { verificarEmpresa } from '../middleware/tenant.middleware.js';
import { requirePermiso } from '../middleware/permissions.middleware.js';

const router = Router();

// Todas las rutas requieren autenticación y contexto de empresa
router.use(verificarAutenticacion);
router.use(verificarEmpresa);

// Catálogo de permisos (antes de :id para evitar conflictos)
router.get('/permisos/catalogo', requirePermiso('ROL_VER'), getPermisosCatalogo);

// CRUD roles
router.get('/', requirePermiso('ROL_VER'), getRoles);
router.get('/:id', requirePermiso('ROL_VER'), getRolById);
router.post('/', requirePermiso('ROL_CREAR'), createRol);
router.put('/:id', requirePermiso('ROL_MODIFICAR'), updateRol);
router.delete('/:id', requirePermiso('ROL_SOFTDELETE'), deleteRol);
router.patch('/:id/reactivar', requirePermiso('ROL_SOFTDELETE'), reactivarRol);

// Usuarios de un rol
router.get('/:id/usuarios', requirePermiso('ROL_VER'), getUsuariosConRol);

export default router;
