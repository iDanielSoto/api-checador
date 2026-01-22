import { Router } from 'express';
import {
    getSolicitudes,
    getSolicitudesPendientes,
    getSolicitudById,
    createSolicitud,
    aceptarSolicitud,
    rechazarSolicitud,
    verificarSolicitud,
    actualizarAPendiente
} from '../controllers/solicitudes.controller.js';
import { verificarAutenticacion, autenticacionOpcional } from '../middleware/auth.middleware.js';
import { requirePermiso } from '../middleware/permissions.middleware.js';

const router = Router();

// Rutas públicas (dispositivos sin autenticación)
router.post('/', createSolicitud);  // Crear solicitud desde dispositivo
router.get('/verificar/:token', verificarSolicitud);  // Verificar estado por token
router.patch('/:id/pendiente', actualizarAPendiente);  // Reabrir solicitud rechazada

// Rutas protegidas
router.get('/', verificarAutenticacion, requirePermiso('DISPOSITIVO_VER'), getSolicitudes);
router.get('/pendientes', verificarAutenticacion, requirePermiso('DISPOSITIVO_ACEPTAR_SOLICITUD'), getSolicitudesPendientes);
router.patch('/:id/aceptar', verificarAutenticacion, requirePermiso('DISPOSITIVO_ACEPTAR_SOLICITUD'), aceptarSolicitud);
router.patch('/:id/rechazar', verificarAutenticacion, requirePermiso('DISPOSITIVO_ACEPTAR_SOLICITUD'), rechazarSolicitud);
router.get('/:id', verificarAutenticacion, requirePermiso('DISPOSITIVO_VER'), getSolicitudById);

export default router;