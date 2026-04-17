import { pool } from '../config/db.js';
import { CATALOGO_MODULOS, tienePermiso, PERMISOS } from '../utils/permissions.js';

/**
 * GET /api/modulos
 * Obtiene todos los módulos activos desde el código
 */
export async function getModulos(req, res) {
    try {
        // Mapear a formato esperado por el frontend
        const modulos = CATALOGO_MODULOS.map(m => ({
            id: m.id,
            codigo: m.id,
            nombre: m.nombre,
            descripcion: m.nombre,
            icono: m.icono,
            ruta: m.ruta,
            orden: m.orden,
            es_activo: true
        }));

        res.json({
            success: true,
            data: modulos
        });

    } catch (error) {
        console.error('Error en getModulos:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener módulos'
        });
    }
}

/**
 * GET /api/modulos/menu
 * Obtiene los módulos del menú filtrados por permisos del usuario
 */
export async function getModulosMenu(req, res) {
    try {
        const usuarioPermisos = req.usuario?.permisosBigInt || BigInt(0);
        const esAdminMaster = req.usuario?.empresa_id === 'MASTER' || req.usuario?.esPropietarioSaaS;

        // Mapeo interno de módulo a permiso requerido para verlo
        const moduloARequisito = {
            'dashboard': null, // Siempre visible
            'usuarios': PERMISOS.USUARIO_VER,
            'empleados': PERMISOS.USUARIO_VER,
            'asistencias': PERMISOS.REGISTRO_VER,
            'horarios': PERMISOS.HORARIO_VER,
            'departamentos': PERMISOS.DEPARTAMENTO_VER,
            'dispositivos': PERMISOS.DISPOSITIVO_VER,
            'avisos': PERMISOS.AVISO_VER,
            'reportes': PERMISOS.REPORTE_VER,
            'configuracion': PERMISOS.CONFIG_VER
        };

        const modulosFiltrados = CATALOGO_MODULOS.filter(m => {
            if (esAdminMaster) return true;
            const permisoReq = moduloARequisito[m.id];
            if (permisoReq === null || permisoReq === undefined) return true;
            return tienePermiso(usuarioPermisos, permisoReq);
        });

        // Mapear a formato esperado por el frontend
        const data = modulosFiltrados.map(m => ({
            id: m.id,
            codigo: m.id,
            nombre: m.nombre,
            icono: m.icono,
            ruta: m.ruta,
            orden: m.orden
        }));

        res.json({
            success: true,
            data: data
        });

    } catch (error) {
        console.error('Error en getModulosMenu:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener menú de módulos'
        });
    }
}

/**
 * Funciones de gestión de módulos (DEPRECADAS)
 * Los módulos ahora son estáticos en el código.
 */
export async function getModuloById(req, res) {
    const { id } = req.params;
    const modulo = CATALOGO_MODULOS.find(m => m.id === id);
    if (!modulo) return res.status(404).json({ success: false, message: 'Módulo no encontrado' });
    res.json({ success: true, data: { ...modulo, codigo: modulo.id, es_activo: true } });
}

export async function createModulo(req, res) {
    res.status(405).json({ success: false, message: 'La creación de módulos está deshabilitada (Catálogo estático)' });
}

export async function updateModulo(req, res) {
    res.status(405).json({ success: false, message: 'La edición de módulos está deshabilitada (Catálogo estático)' });
}

export async function deleteModulo(req, res) {
    res.status(405).json({ success: false, message: 'La eliminación de módulos está deshabilitada (Catálogo estático)' });
}
