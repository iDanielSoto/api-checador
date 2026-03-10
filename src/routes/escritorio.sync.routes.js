import { Router } from 'express';
import {
    getDatosReferencia,
    sincronizarAsistenciasPendientes
} from '../controllers/escritorio.sync.controller.js';
import { sincronizarRawPunch } from '../controllers/escritorio.sync.raw.controller.js';
import { verificarAutenticacion } from '../middleware/auth.middleware.js';

const router = Router();

// Aplicar autenticación a todas las rutas
router.use(verificarAutenticacion);

/**
 * POST /api/escritorio/sync/raw-punch
 * Sincronizar eventos sin conexión directamente hacia el motor principal
 */
router.post('/raw-punch', sincronizarRawPunch);

/**
 * GET /api/escritorio/sync/datos-referencia
 * Query params:
 *   - desde: timestamp opcional para sync incremental
 */
router.get('/datos-referencia', getDatosReferencia);

/**
 * POST /api/escritorio/sync/asistencias-pendientes
 * Sincronizar asistencias pendientes desde el dispositivo
 * Body: { registros: [{ id, empleado_id, tipo, ... }] }
 */
router.post('/asistencias-pendientes', sincronizarAsistenciasPendientes);

export default router;