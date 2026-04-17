import { Router } from 'express';
import {
    getEscritorios,
    getEscritorioById,
    createEscritorio,
    updateEscritorio,
    deleteEscritorio,
    reactivarEscritorio,
    getEscritorioStatusPublico,
    getComandoKiosko,
    getComandoWatchdog,
    sendComando
} from '../controllers/escritorio.controller.js';
import { verificarAutenticacion } from '../middleware/auth.middleware.js';
import { verificarEmpresa } from '../middleware/tenant.middleware.js';
import { requirePermiso } from '../middleware/permissions.middleware.js';

const router = Router();

router.use(verificarAutenticacion);
router.use(verificarEmpresa);

// Rutas protegidas (REQUERIAN AUTENTICACIÓN)
router.get('/status/:id', getEscritorioStatusPublico);

router.get('/:id/comando-kiosko', getComandoKiosko);
router.get('/:id/comando-watchdog', getComandoWatchdog);
router.post('/:id/comando', requirePermiso('DISPOSITIVO_EDITAR'), sendComando);

router.get('/', requirePermiso('DISPOSITIVO_VER'), getEscritorios);
router.get('/:id', requirePermiso('DISPOSITIVO_VER'), getEscritorioById);
router.post('/', requirePermiso('DISPOSITIVO_CREAR'), createEscritorio);
router.put('/:id', requirePermiso('DISPOSITIVO_EDITAR'), updateEscritorio);
router.delete('/:id', requirePermiso('DISPOSITIVO_EDITAR'), deleteEscritorio);
router.patch('/:id/reactivar', requirePermiso('DISPOSITIVO_EDITAR'), reactivarEscritorio);

export default router;

