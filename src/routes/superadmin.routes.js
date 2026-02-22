import { Router } from 'express';
import { createSuperAdmin } from '../controllers/superadmin.controller.js';
import { verificarAutenticacion } from '../middleware/auth.middleware.js';
import { requireSaaSOwner } from '../middleware/tenant.middleware.js';

const router = Router();

// Todas las rutas de Super Administradores requieren ser Dueño del SaaS
router.use(verificarAutenticacion);
router.use(requireSaaSOwner);

router.post('/', createSuperAdmin);

export default router;
