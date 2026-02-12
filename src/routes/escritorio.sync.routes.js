import { Router } from 'express';
import {
    getDatosReferencia,
    sincronizarAsistenciasPendientes
} from '../controllers/escritorio.sync.controller.js';
import { verificarAutenticacion } from '../middleware/auth.middleware.js';

const router = Router();

// Aplicar autenticación a todas las rutas
router.use(verificarAutenticacion);

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