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
    identificarPorFacial,
    loginPorPin,
    verificarFacialPorImagen
} from '../controllers/credenciales.controller.js';
import { verificarAutenticacion } from '../middleware/auth.middleware.js';
import { requirePermiso } from '../middleware/permissions.middleware.js';

const router = Router();

// ── Rutas PÚBLICAS (sin autenticación) ──
router.get('/publico/lista', getCredencialesPublico);
router.get('/publico/dactilar/:empleadoId', getDactilarByEmpleado);
router.post('/facial/identify', identificarPorFacial);
router.post('/pin/login', loginPorPin);

// ── Middleware de autenticación para las demás rutas ──
router.use(verificarAutenticacion);

// Verificación facial por imagen (móvil - requiere auth JWT del empleado)
router.post('/facial/verify-image', verificarFacialPorImagen);

// ── Rutas protegidas ──
router.get('/', requirePermiso('USUARIO_VER'), getCredenciales);
router.get('/empleado/:empleadoId', requirePermiso('USUARIO_VER'), getCredencialesByEmpleado);
router.post('/dactilar', requirePermiso('USUARIO_EDITAR'), guardarDactilar);
router.post('/facial', requirePermiso('USUARIO_EDITAR'), guardarFacial);
router.post('/pin', requirePermiso('USUARIO_EDITAR'), guardarPin);
router.post('/verificar-pin', verificarPin);
router.delete('/empleado/:empleadoId', requirePermiso('USUARIO_EDITAR'), eliminarCredencial);

export default router;
