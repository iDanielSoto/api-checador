import { pool } from '../config/db.js';
import { generateId, ID_PREFIXES } from '../utils/idGenerator.js';

/**
 * GET /api/movil/sync/mis-datos
 * Obtiene datos del empleado, credenciales, horario y tolerancias
 */
export const getMisDatos = async (req, res) => {
    try {
        const { empleado_id } = req.query;

        if (!empleado_id) {
            return res.status(400).json({
                success: false,
                error: 'empleado_id es requerido como query param'
            });
        }

        // ========== EMPLEADO ==========
        const empResult = await pool.query(`
            SELECT
                e.id,
                e.usuario_id,
                u.nombre,
                u.usuario,
                u.correo,
                u.foto,
                (u.estado_cuenta = 'activo') as es_activo,
                e.rfc,
                e.horario_id
            FROM empleados e
            INNER JOIN usuarios u ON e.usuario_id = u.id
            WHERE e.id = $1
        `, [empleado_id]);

        if (empResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Empleado no encontrado'
            });
        }

        const empleado = empResult.rows[0];

        // ========== CREDENCIALES ==========
        // Se asume que credenciales usa empleado_id
        const credResult = await pool.query(`
            SELECT
                id,
                empleado_id,
                pin,
                dactilar,
                facial
            FROM credenciales
            WHERE empleado_id = $1
        `, [empleado_id]);

        const credencial = credResult.rows.length > 0 ? credResult.rows[0] : null;

        // ========== TOLERANCIA (vía rol del usuario) ==========
        let tolerancia = null;
        // Usuarios_roles: usuario_id, rol_id
        // Roles: id, id_tolerancia (o tolerancia_id dependiendo de corrección anterior)
        // En escritorio.sync.controller vimos 'r.id_tolerancia AS tolerancia_id'
        const rolResult = await pool.query(`
            SELECT
                ur.rol_id,
                r.tolerancia_id
            FROM usuarios_roles ur
            INNER JOIN roles r ON ur.rol_id = r.id
            WHERE ur.usuario_id = $1 AND ur.es_activo = true
            LIMIT 1
        `, [empleado.usuario_id]);

        if (rolResult.rows.length > 0 && rolResult.rows[0].tolerancia_id) {
            const tolResult = await pool.query(`
                SELECT
                    id,
                    nombre,
                    minutos_retardo,
                    minutos_falta,
                    permite_registro_anticipado,
                    minutos_anticipado_max,
                    aplica_tolerancia_entrada,
                    aplica_tolerancia_salida
                FROM tolerancias
                WHERE id = $1
            `, [rolResult.rows[0].tolerancia_id]);

            if (tolResult.rows.length > 0) {
                tolerancia = tolResult.rows[0];
            }
        }

        // ========== DEPARTAMENTOS ==========
        // empleados_departamentos: empleado_id, departamento_id
        // departamentos: id, nombre
        const deptoResult = await pool.query(`
            SELECT
                ed.empleado_id,
                ed.departamento_id,
                ed.es_activo,
                d.nombre,
                d.descripcion,
                d.ubicacion,
                d.color
            FROM empleados_departamentos ed
            INNER JOIN departamentos d ON ed.departamento_id = d.id
            WHERE ed.empleado_id = $1
        `, [empleado_id]);

        const departamentos = deptoResult.rows;

        // ========== RESPUESTA ==========
        res.json({
            success: true,
            empleado,
            credencial,
            tolerancia,
            departamentos,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('❌ [movilSync] Error en getMisDatos:', error);
        res.status(500).json({
            success: false,
            error: 'Error al obtener datos del empleado'
        });
    }
};

/**
 * POST /api/movil/sync/asistencias
 * 
 * Recibe asistencias pendientes del dispositivo móvil.
 * Mismo formato que el endpoint de escritorio.
 */
export const sincronizarAsistencias = async (req, res) => {
    try {
        const { registros } = req.body;

        if (!registros || !Array.isArray(registros) || registros.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'Se requiere un array de registros'
            });
        }

        const sincronizados = [];
        const rechazados = [];

        for (const reg of registros) {
            try {
                // Validar campos requeridos
                if (!reg.empleado_id || !reg.tipo) {
                    rechazados.push({
                        id_local: reg.id,
                        error: 'Campos requeridos faltantes',
                        codigo: 'CAMPOS_FALTANTES'
                    });
                    continue;
                }

                // Verificar que el empleado existe
                const empCheck = await pool.query(
                    'SELECT id FROM empleados WHERE id = $1',
                    [reg.empleado_id]
                );

                if (empCheck.rows.length === 0) {
                    rechazados.push({
                        id_local: reg.id,
                        error: 'Empleado no existe',
                        codigo: 'EMPLEADO_NO_EXISTE'
                    });
                    continue;
                }

                // Verificar duplicado por ID si el móvil envía un ID (idempotency) o generar uno nuevo
                // Asumiremos que si ya existe un ID en BDD igual al local, ya se sincronizó.
                // PERO el ID local puede ser UUID generado por movil o integer serial.
                // Si el ID es texto y usamos UUIDs, podríamos chequearlo. 
                // Mejor estrategia: Chequear duplicado por fecha/empleado/tipo como en escritorio.sync

                const fecha = reg.fecha_registro
                    ? new Date(reg.fecha_registro)
                    : new Date();

                const dosMinsAntes = new Date(fecha.getTime() - (2 * 60 * 1000));
                const dosMinsDespues = new Date(fecha.getTime() + (2 * 60 * 1000));

                const dupCheck = await pool.query(`
                  SELECT id
                  FROM asistencias
                  WHERE empleado_id = $1
                    AND tipo = $2
                    AND fecha_registro BETWEEN $3 AND $4
                  LIMIT 1
                `, [reg.empleado_id, reg.tipo, dosMinsAntes, dosMinsDespues]);

                if (dupCheck.rows.length > 0) {
                    sincronizados.push({
                        id_local: reg.id,
                        id_servidor: dupCheck.rows[0].id
                    });
                    continue;
                }

                // Generar ID
                const servidor_id = await generateId(ID_PREFIXES.ASISTENCIA);

                // Insertar registro
                // Campos: id, empleado_id, tipo, estado, departamento_id, dispositivo_origen, fecha_registro
                // Nota: 'metodo_registro' no parece estar en el esquema original del insert en escritorio.sync
                await pool.query(`
                    INSERT INTO asistencias
                    (id, empleado_id, tipo, estado, departamento_id,
                     dispositivo_origen, fecha_registro, ubicacion)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                `, [
                    servidor_id,
                    reg.empleado_id,
                    reg.tipo,
                    reg.estado || reg.clasificacion || 'pendiente',
                    reg.departamento_id || null,
                    reg.dispositivo_origen || 'movil',
                    fecha,
                    reg.ubicacion || null
                ]);

                sincronizados.push({
                    id_local: reg.id,
                    id_servidor: servidor_id
                });

            } catch (regError) {
                rechazados.push({
                    id_local: reg.id,
                    error: regError.message,
                    codigo: 'ERROR_INTERNO'
                });
            }
        }

        console.log(`📱 [movilSync] Asistencias: ${sincronizados.length} OK, ${rechazados.length} Error`);

        res.json({
            success: true,
            sincronizados,
            rechazados
        });

    } catch (error) {
        console.error('❌ [movilSync] Error sincronizando asistencias:', error);
        res.status(500).json({
            success: false,
            error: 'Error al sincronizar asistencias'
        });
    }
};

/**
 * POST /api/movil/sync/sesiones
 * 
 * Recibe eventos de sesión offline (login/logout) del móvil.
 * Los guarda en la tabla sesiones_movil para auditoría del admin.
 */
export const sincronizarSesiones = async (req, res) => {
    try {
        const { sesiones } = req.body;

        if (!sesiones || !Array.isArray(sesiones) || sesiones.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'Se requiere un array de sesiones'
            });
        }

        // Crear tabla si no existe (auto-migración)
        // Usamos plural sesiones_movil para consistencia
        await pool.query(`
            CREATE TABLE IF NOT EXISTS sesiones_movil (
                id SERIAL PRIMARY KEY,
                usuario_id VARCHAR(8) REFERENCES usuarios(id),
                empleado_id VARCHAR(8) REFERENCES empleados(id),
                tipo VARCHAR(10) NOT NULL,
                modo VARCHAR(20) NOT NULL DEFAULT 'offline',
                fecha_evento TIMESTAMP NOT NULL,
                dispositivo VARCHAR(50) DEFAULT 'movil',
                recibido_at TIMESTAMP DEFAULT NOW()
            )
        `);

        const sincronizados = [];
        const errores = [];

        for (const s of sesiones) {
            try {
                if (!s.usuario_id || !s.tipo || !s.fecha_evento) {
                    errores.push({ local_id: s.local_id, error: 'Campos requeridos faltantes' });
                    continue;
                }

                await pool.query(`
                    INSERT INTO sesiones_movil (usuario_id, empleado_id, tipo, modo, fecha_evento, dispositivo)
                    VALUES ($1, $2, $3, $4, $5, $6)
                `, [
                    s.usuario_id,
                    s.empleado_id || null,
                    s.tipo,
                    s.modo || 'offline',
                    new Date(s.fecha_evento),
                    s.dispositivo || 'movil'
                ]);

                sincronizados.push({ local_id: s.local_id });

            } catch (sError) {
                // Si falla por foreign key (empleado_id es texto, usuario_id int)
                errores.push({ local_id: s.local_id, error: sError.message });
            }
        }

        console.log(`📱 [movilSync] Sesiones: ${sincronizados.length} OK, ${errores.length} Error`);

        res.json({
            success: true,
            sincronizados,
            errores
        });

    } catch (error) {
        console.error('❌ [movilSync] Error sincronizando sesiones:', error);
        res.status(500).json({
            success: false,
            error: 'Error al sincronizar sesiones'
        });
    }
};
