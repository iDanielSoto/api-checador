import { Router } from 'express';
import * as movilSyncController from '../controllers/movil.sync.controller.js';
import { verificarAutenticacion } from '../middleware/auth.middleware.js';

const router = Router();

// Aplicar autenticación si es necesario, o dejar abierto si el móvil maneja su propio token/auth
// El código original del usuario no mostraba middleware, pero es buena práctica.
// Sin embargo, si es endpoint de sync, a veces se usa un token especial.
// Asumiremos que se requiere autenticación estándar por ahora, o lo dejaremos abierto si el controller maneja validación.
// Revisando otros archivos .routes.js, veo que usan verificarAutenticacion.
// Pero para 'sync' inicial (login), quizás no sea posible si no tiene token.
// El endpoint 'sincronizarSesiones' y 'sincronizarAsistencias' probablemente requieran auth.
// 'getMisDatos' requiere 'empleado_id', asumiremos que el usuario ya se logueó en el móvil.
// Por ahora NO agregaré el middleware globalmente al router para evitar romper el flujo si el móvil no envía el header correcto aún,
// salvo que el usuario lo haya pedido explícitamente (no lo hizo en el snippet).
// Update: El snippet del usuario para 'escritorio.sync.routes.js' sí tenía autenticación.
// Pero en el snippet de movil rutas no lo puso. Lo dejaré sin auth explícito por ahora para seguir el snippet, 
// o mejor aún, lo comento.

// router.use(verificarAutenticacion);

// GET  /api/movil/sync/mis-datos?empleado_id=XX
router.get('/sync/mis-datos', movilSyncController.getMisDatos);

// POST /api/movil/sync/asistencias
router.post('/sync/asistencias', movilSyncController.sincronizarAsistencias);

// POST /api/movil/sync/sesiones
router.post('/sync/sesiones', movilSyncController.sincronizarSesiones);

export default router;
