import { Router } from 'express';
import {
    getMoviles,
    getMovilById,
    createMovil,
    updateMovil,
    deleteMovil,
    reactivarMovil,
    getMovilEmpleado
} from '../controllers/movil.controller.js';
import { verificarAutenticacion } from '../middleware/auth.middleware.js';
import { requirePermiso, requirePermisoOrSelf } from '../middleware/permissions.middleware.js';

const router = Router();

router.use(verificarAutenticacion);

// Ruta específica primero
router.get('/empleado/:empleadoId', requirePermisoOrSelf('empleadoId', 'DISPOSITIVO_VER'), getMovilEmpleado);

router.get('/', requirePermiso('DISPOSITIVO_VER'), getMoviles);
router.get('/:id', requirePermiso('DISPOSITIVO_VER'), getMovilById);
router.post('/', requirePermiso('DISPOSITIVO_CREAR'), createMovil);
router.put('/:id', requirePermiso('DISPOSITIVO_MODIFICAR'), updateMovil);
router.delete('/:id', requirePermiso('DISPOSITIVO_MODIFICAR'), deleteMovil);
router.patch('/:id/reactivar', requirePermiso('DISPOSITIVO_MODIFICAR'), reactivarMovil);

export default router;
