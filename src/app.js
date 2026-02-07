import express from 'express';
import cors from 'cors';

// Rutas
import authRoutes from './routes/auth.routes.js';
import usuariosRoutes from './routes/usuarios.routes.js';
import empleadosRoutes from './routes/empleados.routes.js';
import rolesRoutes from './routes/roles.routes.js';
import horariosRoutes from './routes/horarios.routes.js';
import toleranciasRoutes from './routes/tolerancias.routes.js';
import asistenciasRoutes from './routes/asistencias.routes.js';
import incidenciasRoutes from './routes/incidencias.routes.js';
import escritorioRoutes from './routes/escritorio.routes.js';
import movilRoutes from './routes/movil.routes.js';
import biometricoRoutes from './routes/biometrico.routes.js';
import solicitudesRoutes from './routes/solicitudes.routes.js';
import eventosRoutes from './routes/eventos.routes.js';
import configuracionRoutes from './routes/configuracion.routes.js';
import empresasRoutes from './routes/empresas.routes.js';
import departamentosRoutes from './routes/departamentos.routes.js';
import credencialesRoutes from './routes/credenciales.routes.js';
import modulosRoutes from './routes/modulos.routes.js';
import reportesRoutes from './routes/reportes.routes.js';
import streamRoutes from './routes/stream.routes.js';
import diasFestivosRoutes from './routes/diasFestivos.routes.js';

const app = express();

app.set('trust proxy', true);
app.use(cors({
    origin: "*",
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));
app.use(express.static('public'));

app.get('/', (req, res) => {
    res.json({
        status: 'OK',
        service: 'CHECADOR',
        version: '2.0',
        message: 'Respuesta obtenida correctamente.'
    });
});

// Registrar rutas
app.use('/api/auth', authRoutes);
app.use('/api/usuarios', usuariosRoutes);
app.use('/api/empleados', empleadosRoutes);
app.use('/api/roles', rolesRoutes);
app.use('/api/horarios', horariosRoutes);
app.use('/api/tolerancias', toleranciasRoutes);
app.use('/api/asistencias', asistenciasRoutes);
app.use('/api/incidencias', incidenciasRoutes);
app.use('/api/escritorio', escritorioRoutes);
app.use('/api/movil', movilRoutes);
app.use('/api/biometrico', biometricoRoutes);
app.use('/api/solicitudes', solicitudesRoutes);
app.use('/api/eventos', eventosRoutes);
app.use('/api/configuracion', configuracionRoutes);
app.use('/api/empresas', empresasRoutes);
app.use('/api/departamentos', departamentosRoutes);
app.use('/api/credenciales', credencialesRoutes);
app.use('/api/modulos', modulosRoutes);
app.use('/api/reportes', reportesRoutes);
app.use('/api/stream', streamRoutes);
app.use('/api/dias-festivos', diasFestivosRoutes);

export default app;