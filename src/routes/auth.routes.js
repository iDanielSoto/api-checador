import { Router } from 'express';
import {
    login,
    loginSaaS,
    logout,
    verificarSesion,
    cambiarPassword,
    loginBiometrico,
    impersonarEmpresa
} from '../controllers/auth.controller.js';
import { verificarAutenticacion } from '../middleware/auth.middleware.js';

const router = Router();

// Rutas públicas (no requieren autenticación)
router.post('/login', login);
router.post('/login-saas', loginSaaS);
router.post('/biometric', loginBiometrico);
router.post('/logout', logout);

// Rutas protegidas (requieren autenticación)
router.get('/verificar', verificarAutenticacion, verificarSesion);
router.post('/cambiar-password', verificarAutenticacion, cambiarPassword);
router.post('/impersonate', verificarAutenticacion, impersonarEmpresa);

export default router;
