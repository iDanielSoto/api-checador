import { Router } from 'express';
import {
    getUsuarios,
    getUsuarioById,
    createUsuario,
    updateUsuario,
    deleteUsuario,
    getRolesDeUsuario,
    asignarRol,
    removerRol
} from '../controllers/usuarios.controller.js';
import { verificarAutenticacion } from '../middleware/auth.middleware.js';
import { requirePermiso, requirePermisoOrSelf } from '../middleware/permissions.middleware.js';

const router = Router();

// Todas las rutas requieren autenticación
router.use(verificarAutenticacion);

// CRUD usuarios
router.get('/', requirePermiso('USUARIO_VER'), getUsuarios);
router.get('/:id', requirePermisoOrSelf('id', 'USUARIO_VER'), getUsuarioById);
router.post('/', requirePermiso('USUARIO_CREAR'), createUsuario);
router.put('/:id', requirePermisoOrSelf('id', 'USUARIO_MODIFICAR'), updateUsuario);
router.delete('/:id', requirePermiso('USUARIO_SOFTDELETE'), deleteUsuario);

// Gestión de roles de usuario
router.get('/:id/roles', requirePermisoOrSelf('id', 'ROL_VER'), getRolesDeUsuario);
router.post('/:id/roles', requirePermiso('ROL_ASIGNAR'), asignarRol);
router.delete('/:id/roles/:rolId', requirePermiso('ROL_ASIGNAR'), removerRol);

export default router;
