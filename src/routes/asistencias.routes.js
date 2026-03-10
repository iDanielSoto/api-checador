import { Router } from 'express';
import {
    registrarAsistencia,
    getAsistencias,
    getAsistenciasEmpleado,
    getAsistenciasHoy,
    registrarAsistenciaManual,
    getEquivalenciasEmpleado,
    getPreflightEstadoAsistencia,
    getEstadoBotonMovil
} from '../controllers/asistencias.controller.js';
import { verificarAutenticacion } from '../middleware/auth.middleware.js';
import { verificarEmpresa } from '../middleware/tenant.middleware.js';
import { requirePermiso, requirePermisoOrSelf } from '../middleware/permissions.middleware.js';

const router = Router();

router.use(verificarAutenticacion);
router.use(verificarEmpresa);

// Rutas específicas primero
router.get('/hoy', requirePermiso('REGISTRO_VER'), getAsistenciasHoy);
router.get('/empleado/:empleadoId/equivalencias', requirePermisoOrSelf('empleadoId', 'REGISTRO_VER'), getEquivalenciasEmpleado);
router.get('/estado/:empleadoId', requirePermisoOrSelf('empleadoId', 'REGISTRO_VER'), getPreflightEstadoAsistencia);
router.get('/movil/estado-boton/:empleadoId', requirePermisoOrSelf('empleadoId', 'REGISTRO_VER'), getEstadoBotonMovil);
router.get('/empleado/:empleadoId', requirePermisoOrSelf('empleadoId', 'REGISTRO_VER'), getAsistenciasEmpleado);

// CRUD
router.get('/', requirePermiso('REGISTRO_VER'), getAsistencias);
router.post('/registrar', registrarAsistencia);  // Cualquier usuario autenticado puede registrar
router.post('/manual', requirePermiso('REGISTRO_VER'), registrarAsistenciaManual);

export default router;
