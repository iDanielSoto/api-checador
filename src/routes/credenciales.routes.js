import { Router } from 'express';
import {
    getCredenciales,
    getCredencialesByEmpleado,
    guardarDactilar,
    guardarFacial,
    guardarPin,
    verificarPin,
    eliminarCredencial,
    getCredencialesPublico,
    getDactilarByEmpleado,
    identificarPorFacial
} from '../controllers/credenciales.controller.js';
import { verificarAutenticacion } from '../middleware/auth.middleware.js';
import { requirePermiso } from '../middleware/permissions.middleware.js';
import { verificarServiceKey } from '../middleware/service.middleware.js';

const router = Router();

router.get('/publico/lista', getCredencialesPublico);
router.get('/publico/dactilar/:empleadoId', getDactilarByEmpleado);

// Middleware de autenticación para las demás rutas
router.use(verificarAutenticacion);

// Rutas protegidas
router.get('/', requirePermiso('USUARIO_VER'), getCredenciales);
router.get('/empleado/:empleadoId', requirePermiso('USUARIO_VER'), getCredencialesByEmpleado);
router.post('/dactilar', requirePermiso('USUARIO_MODIFICAR'), guardarDactilar);
router.post('/facial', requirePermiso('USUARIO_MODIFICAR'), guardarFacial);
router.post('/pin', requirePermiso('USUARIO_MODIFICAR'), guardarPin);
router.post('/verificar-pin', verificarPin);
router.delete('/empleado/:empleadoId', requirePermiso('USUARIO_MODIFICAR'), eliminarCredencial);
// Ruta PÚBLICA (sin middleware de autenticación)
router.post('/facial/identify', identificarPorFacial);

export default router;