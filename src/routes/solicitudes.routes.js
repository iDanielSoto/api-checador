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
    cancelarSolicitud
} from '../controllers/solicitudes.controller.js';
import { verificarAutenticacion, autenticacionOpcional } from '../middleware/auth.middleware.js';
import { verificarEmpresa } from '../middleware/tenant.middleware.js';
import { requirePermiso } from '../middleware/permissions.middleware.js';

const router = Router();

// SSE stream (usa token por query param porque EventSource no soporta headers)
router.get('/stream', streamSolicitudes);

// Rutas públicas (dispositivos sin autenticación)
router.post('/', createSolicitud);  // Crear solicitud desde dispositivo
router.delete('/:id', cancelarSolicitud);  // Cancelar solicitud por el usuario
router.get('/verificar/:token', verificarSolicitud);  // Verificar estado por token
router.patch('/:id/pendiente', actualizarAPendiente);  // Reabrir solicitud rechazada

// Rutas protegidas (requieren autenticación + contexto de empresa)
router.get('/', verificarAutenticacion, verificarEmpresa, requirePermiso('DISPOSITIVO_VER'), getSolicitudes);
router.get('/pendientes', verificarAutenticacion, verificarEmpresa, requirePermiso('DISPOSITIVO_ACEPTAR_SOLICITUD'), getSolicitudesPendientes);
router.patch('/:id/aceptar', verificarAutenticacion, verificarEmpresa, requirePermiso('DISPOSITIVO_ACEPTAR_SOLICITUD'), aceptarSolicitud);
router.patch('/:id/rechazar', verificarAutenticacion, verificarEmpresa, requirePermiso('DISPOSITIVO_ACEPTAR_SOLICITUD'), rechazarSolicitud);
router.get('/:id', verificarAutenticacion, verificarEmpresa, requirePermiso('DISPOSITIVO_VER'), getSolicitudById);

export default router;