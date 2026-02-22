import { Router } from 'express';
import {
    getIncidencias,
    getIncidenciaById,
    createIncidencia,
    updateIncidencia,
    aprobarIncidencia,
    rechazarIncidencia,
    getIncidenciasPendientes
} from '../controllers/incidencias.controller.js';
import { verificarAutenticacion } from '../middleware/auth.middleware.js';
import { verificarEmpresa } from '../middleware/tenant.middleware.js';
import { requirePermiso } from '../middleware/permissions.middleware.js';

const router = Router();

router.use(verificarAutenticacion);
router.use(verificarEmpresa);

// Rutas específicas primero
router.get('/pendientes', requirePermiso('REGISTRO_VER'), getIncidenciasPendientes);

// CRUD
router.get('/', requirePermiso('REGISTRO_VER'), getIncidencias);
router.get('/:id', requirePermiso('REGISTRO_VER'), getIncidenciaById);
router.post('/', createIncidencia);  // Cualquier empleado puede crear incidencia
router.put('/:id', updateIncidencia);

// Aprobación/Rechazo (requiere permisos de admin o supervisor)
router.patch('/:id/aprobar', requirePermiso('USUARIO_MODIFICAR'), aprobarIncidencia);
router.patch('/:id/rechazar', requirePermiso('USUARIO_MODIFICAR'), rechazarIncidencia);

export default router;
