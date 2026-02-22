import { Router } from 'express';
import {
    getUsuarios,
    getUsuarioById,
    getUsuarioByUsername,
    createUsuario,
    updateUsuario,
    deleteUsuario,
    reactivarUsuario,
    getRolesDeUsuario,
    asignarRol,
    removerRol
} from '../controllers/usuarios.controller.js';
import { verificarAutenticacion } from '../middleware/auth.middleware.js';
import { verificarEmpresa } from '../middleware/tenant.middleware.js';
import { requirePermiso, requirePermisoOrSelf } from '../middleware/permissions.middleware.js';

const router = Router();

// Todas las rutas requieren autenticación y contexto de empresa
router.use(verificarAutenticacion);
router.use(verificarEmpresa);

// CRUD usuarios
router.get('/', requirePermiso('USUARIO_VER'), getUsuarios);
// Ruta específica para obtener por username (debe ir ANTES de /:id)
router.get('/username/:username', getUsuarioByUsername);
router.get('/:id', requirePermisoOrSelf('id', 'USUARIO_VER'), getUsuarioById);
router.post('/', requirePermiso('USUARIO_CREAR'), createUsuario);
router.put('/:id', requirePermisoOrSelf('id', 'USUARIO_MODIFICAR'), updateUsuario);
router.delete('/:id', requirePermiso('USUARIO_SOFTDELETE'), deleteUsuario);
router.patch('/:id/reactivar', requirePermiso('USUARIO_SOFTDELETE'), reactivarUsuario);

// Gestión de roles de usuario
router.get('/:id/roles', requirePermisoOrSelf('id', 'ROL_VER'), getRolesDeUsuario);
router.post('/:id/roles', requirePermiso('ROL_ASIGNAR'), asignarRol);
router.delete('/:id/roles/:rolId', requirePermiso('ROL_ASIGNAR'), removerRol);

export default router;
