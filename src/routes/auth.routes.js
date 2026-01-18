import { Router } from 'express';
import {
    login,
    logout,
    verificarSesion,
    cambiarPassword
} from '../controllers/auth.controller.js';
import { verificarAutenticacion } from '../middleware/auth.middleware.js';

const router = Router();

// Rutas públicas (no requieren autenticación)
router.post('/login', login);
router.post('/logout', logout);

// Rutas protegidas (requieren autenticación)
router.get('/verificar', verificarAutenticacion, verificarSesion);
router.post('/cambiar-password', verificarAutenticacion, cambiarPassword);

export default router;
