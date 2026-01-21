import { Router } from 'express';
import {
    getEmpleados,
    getEmpleadoById,
    updateEmpleado,
    getDepartamentosDeEmpleado,
    asignarDepartamento,
    removerDepartamento,
    getHorarioDeEmpleado,
    buscarPorRFC,
    buscarPorNSS
} from '../controllers/empleados.controller.js';
import { verificarAutenticacion } from '../middleware/auth.middleware.js';
import { requirePermiso, requirePermisoOrSelf } from '../middleware/permissions.middleware.js';

const router = Router();

// Todas las rutas requieren autenticación
router.use(verificarAutenticacion);

// Búsquedas específicas (antes de :id para evitar conflictos)
router.get('/buscar/rfc/:rfc', requirePermiso('USUARIO_VER'), buscarPorRFC);
router.get('/buscar/nss/:nss', requirePermiso('USUARIO_VER'), buscarPorNSS);

// CRUD empleados
router.get('/', requirePermiso('USUARIO_VER'), getEmpleados);
router.get('/:id', requirePermisoOrSelf('id', 'USUARIO_VER'), getEmpleadoById);
router.put('/:id', requirePermiso('USUARIO_MODIFICAR'), updateEmpleado);

// Gestión de departamentos
router.get('/:id/departamentos', requirePermisoOrSelf('id', 'DEPARTAMENTO_VER'), getDepartamentosDeEmpleado);
router.post('/:id/departamentos', requirePermiso('DEPARTAMENTO_ASIGNAR'), asignarDepartamento);
router.delete('/:id/departamentos/:deptoId', requirePermiso('DEPARTAMENTO_ASIGNAR'), removerDepartamento);

// Obtener horario de empleado
router.get('/:id/horario', requirePermisoOrSelf('id', 'HORARIO_VER'), getHorarioDeEmpleado);


export default router;
