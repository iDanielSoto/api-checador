import { Router } from 'express';
import {
    getSolicitudes,
    getSolicitudesPendientes,
    getSolicitudById,
    createSolicitud,
    aceptarSolicitud,
    rechazarSolicitud,
    verificarSolicitud,
    actualizarAPendiente,
    streamSolicitudes,
    cancelarSolicitud,
    validarAfiliacion
} from '../controllers/solicitudes.controller.js';
import { verificarAutenticacion, autenticacionOpcional } from '../middleware/auth.middleware.js';
import { verificarEmpresa } from '../middleware/tenant.middleware.js';
import { requirePermiso } from '../middleware/permissions.middleware.js';

const router = Router();

// SSE stream (usa token por query param o header)
router.get('/stream', verificarAutenticacion, streamSolicitudes);

// Rutas protegidas (REQUERIAN AUTENTICACIÓN)
router.post('/validar-afiliacion', verificarAutenticacion, validarAfiliacion); // Validar afiliación y red
router.post('/', createSolicitud);  // Crear solicitud (el controlador debe manejar la auth o usar middleware)
router.delete('/:id', verificarAutenticacion, cancelarSolicitud);  // Cancelar solicitud
router.get('/verificar/:token', verificarSolicitud);  // Verificar estado
router.patch('/:id/pendiente', verificarAutenticacion, actualizarAPendiente);  // Reabrir solicitud

// Rutas protegidas (requieren autenticación + contexto de empresa)
router.get('/', verificarAutenticacion, verificarEmpresa, requirePermiso('DISPOSITIVO_VER'), getSolicitudes);
router.get('/pendientes', verificarAutenticacion, verificarEmpresa, requirePermiso('DISPOSITIVO_GESTIONAR'), getSolicitudesPendientes);
router.patch('/:id/aceptar', verificarAutenticacion, verificarEmpresa, requirePermiso('DISPOSITIVO_GESTIONAR'), aceptarSolicitud);
router.patch('/:id/rechazar', verificarAutenticacion, verificarEmpresa, requirePermiso('DISPOSITIVO_GESTIONAR'), rechazarSolicitud);
router.get('/:id', verificarAutenticacion, verificarEmpresa, requirePermiso('DISPOSITIVO_VER'), getSolicitudById);

export default router;
