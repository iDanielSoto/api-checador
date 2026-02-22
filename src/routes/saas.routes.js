import { Router } from 'express';
import { getMetricasSaaS, getLogsSaaS } from '../controllers/saas.controller.js';
import { verificarAutenticacion } from '../middleware/auth.middleware.js';
import { requireSaaSOwner } from '../middleware/tenant.middleware.js';

const router = Router();

// Todas las rutas SaaS requieren autenticación y nivel de Propietario SaaS
router.use(verificarAutenticacion, requireSaaSOwner);

router.get('/metricas', getMetricasSaaS);
router.get('/logs', getLogsSaaS);

export default router;
