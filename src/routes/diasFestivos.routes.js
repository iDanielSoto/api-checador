import express from 'express';
import { verificarAutenticacion } from '../middleware/auth.middleware.js';
import { requirePermiso } from '../middleware/permissions.middleware.js';
import {
    getDiasFestivos,
    sincronizarDiasFestivos,
    createDiaFestivo,
    updateDiaFestivo,
    deleteDiaFestivo
} from '../controllers/diasFestivos.controller.js';

const router = express.Router();

// Todas las rutas requieren autenticación
router.use(verificarAutenticacion);

// GET /api/dias-festivos - Obtener todos los días festivos
router.get('/', requirePermiso('HORARIO_VER'), getDiasFestivos);

// POST /api/dias-festivos/sincronizar - Sincronizar desde API externa
router.post('/sincronizar', requirePermiso('HORARIO_CREAR'), sincronizarDiasFestivos);

// POST /api/dias-festivos - Crear día festivo personalizado
router.post('/', requirePermiso('HORARIO_CREAR'), createDiaFestivo);

// PUT /api/dias-festivos/:id - Actualizar día festivo
router.put('/:id', requirePermiso('HORARIO_MODIFICAR'), updateDiaFestivo);

// DELETE /api/dias-festivos/:id - Desactivar día festivo
router.delete('/:id', requirePermiso('HORARIO_SOFTDELETE'), deleteDiaFestivo);

export default router;
