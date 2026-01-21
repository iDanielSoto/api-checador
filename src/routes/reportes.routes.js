import { Router } from 'express';
import {
    getEstadisticasGlobales,
    getEstadisticasEmpleado,
    getEstadisticasDepartamento,
    getDetalleAsistencias,
    getDetalleIncidencias,
    getReporteDesempeno
} from '../controllers/reportes.controller.js';
import { verificarAutenticacion } from '../middleware/auth.middleware.js';
import { requirePermiso } from '../middleware/permissions.middleware.js';

const router = Router();

router.use(verificarAutenticacion);

// Estadísticas
router.get('/estadisticas-globales', requirePermiso('REPORTE_EXPORTAR', 'REGISTRO_VER'), getEstadisticasGlobales);
router.get('/estadisticas-empleado/:empleadoId', requirePermiso('REPORTE_EXPORTAR', 'REGISTRO_VER'), getEstadisticasEmpleado);
router.get('/estadisticas-departamento/:departamentoId', requirePermiso('REPORTE_EXPORTAR', 'REGISTRO_VER'), getEstadisticasDepartamento);

// Detalles para exportación
router.get('/detalle-asistencias', requirePermiso('REPORTE_EXPORTAR'), getDetalleAsistencias);
router.get('/detalle-incidencias', requirePermiso('REPORTE_EXPORTAR'), getDetalleIncidencias);

// Desempeño
router.get('/desempeno', requirePermiso('REPORTE_EXPORTAR'), getReporteDesempeno);

export default router;