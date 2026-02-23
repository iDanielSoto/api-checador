import { pool } from '../config/db.js';
import { generateId, ID_PREFIXES } from '../utils/idGenerator.js';
import { ejecutarValidacionesRed } from '../utils/networkValidator.js';

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
        let empleado;
        try {
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
            empleado = empResult.rows[0];
            // FIX: el cliente espera empleado.empleado_id para el upsert en SQLite
            empleado.empleado_id = empleado.id;
        } catch (empError) {
            console.error('❌ [movilSync] Error en query EMPLEADO:', empError);
            return res.status(500).json({ success: false, error: `Error en query empleado: ${empError.message}` });
        }

        // ========== CREDENCIALES ==========
        let credencial = null;
        try {
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
            credencial = credResult.rows.length > 0 ? credResult.rows[0] : null;
        } catch (credError) {
            console.error('❌ [movilSync] Error en query CREDENCIALES:', credError);
            return res.status(500).json({ success: false, error: `Error en query credenciales: ${credError.message}` });
        }

        // ========== TOLERANCIA (vía rol del usuario) ==========
        let tolerancia = null;
        try {
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
        } catch (tolError) {
            console.error('❌ [movilSync] Error en query TOLERANCIA:', tolError);
            return res.status(500).json({ success: false, error: `Error en query tolerancia: ${tolError.message}` });
        }

        // ========== DEPARTAMENTOS ==========
        let departamentos = [];
        try {
            // FIX: incluir latitud, longitud y radio que el cliente SQLite necesita
            // para geolocalización al registrar asistencia
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
            departamentos = deptoResult.rows;
        } catch (depError) {
            console.error('❌ [movilSync] Error en query DEPARTAMENTOS:', depError);
            return res.status(500).json({ success: false, error: `Error en query departamentos: ${depError.message}` });
        }

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
        console.error('❌ [movilSync] Error general en getMisDatos:', error);
        res.status(500).json({
            success: false,
            error: `Error general: ${error.message}`
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

                // --- Validar segmentos de red para esta asistencia ---
                let alertasReg = [];
                try {
                    // Obtener empresa del empleado y sus segmentos de red
                    const empEmpresa = await pool.query(`
                        SELECT e.id as empresa_id, c.segmentos_red
                        FROM empleados emp
                        INNER JOIN usuarios u ON emp.usuario_id = u.id
                        INNER JOIN empresas e ON e.id = u.empresa_id
                        INNER JOIN configuraciones c ON c.id = e.configuracion_id
                        WHERE emp.id = $1
                    `, [reg.empleado_id]);

                    if (empEmpresa.rows.length > 0) {
                        const segmentosRed = empEmpresa.rows[0].segmentos_red || [];

                        // Extraer coordenadas GPS si el móvil las envió
                        let coordenadas = null;
                        if (reg.ubicacion && Array.isArray(reg.ubicacion) && reg.ubicacion.length >= 2) {
                            coordenadas = { lat: reg.ubicacion[0], lng: reg.ubicacion[1] };
                        } else if (reg.lat && reg.lng) {
                            coordenadas = { lat: reg.lat, lng: reg.lng };
                        }

                        const validacion = ejecutarValidacionesRed({
                            ip: reg.ip || null,
                            segmentosRed,
                            coordenadas,
                            wifi: reg.wifi || null,  // { bssid, ssid } si el móvil lo envía
                        });

                        alertasReg = validacion.alertas;

                        if (alertasReg.length > 0) {
                            console.warn(`⚠️ [movilSync] Alertas de red para ${reg.empleado_id}:`, alertasReg.map(a => a.tipo).join(', '));
                        }
                    }
                } catch (netErr) {
                    console.error('[movilSync] Error al validar red (no crítico):', netErr.message);
                }

                // Insertar registro con alertas de red
                await pool.query(`
                    INSERT INTO asistencias
                    (id, empleado_id, tipo, estado, departamento_id,
                     dispositivo_origen, fecha_registro, ubicacion, alertas)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                `, [
                    servidor_id,
                    reg.empleado_id,
                    reg.tipo,
                    reg.estado || reg.clasificacion || 'pendiente',
                    reg.departamento_id || null,
                    reg.dispositivo_origen || 'movil',
                    fecha,
                    reg.ubicacion || null,
                    JSON.stringify(alertasReg)
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
        // SIN foreign keys para evitar violaciones con IDs de sesiones offline
        // FIX: usar IF NOT EXISTS y evitar recrear en cada request
        // FIX: usuario_id y empleado_id como TEXT para coincidir con IDs alfanuméricos
        // del generador de IDs del sistema (ID_PREFIXES genera strings, no integers)
        await pool.query(`
            CREATE TABLE IF NOT EXISTS sesiones_movil (
                id SERIAL PRIMARY KEY,
                usuario_id TEXT,
                empleado_id TEXT,
                tipo VARCHAR(10) NOT NULL,
                modo VARCHAR(20) NOT NULL DEFAULT 'offline',
                fecha_evento TIMESTAMP NOT NULL,
                dispositivo VARCHAR(50) DEFAULT 'movil',
                recibido_at TIMESTAMP DEFAULT NOW()
            )
        `);

        // Migración: si la tabla vieja tiene FK constraints, recrearla sin ellos
        try {
            const fkCheck = await pool.query(`
                SELECT COUNT(*) as fk_count
                FROM information_schema.table_constraints
                WHERE table_name = 'sesiones_movil'
                  AND constraint_type = 'FOREIGN KEY'
            `);
            if (parseInt(fkCheck.rows[0].fk_count) > 0) {
                console.log('🔧 [movilSync] Migrando sesiones_movil: eliminando foreign keys...');
                // Guardar datos existentes
                const backup = await pool.query('SELECT * FROM sesiones_movil');
                await pool.query('DROP TABLE sesiones_movil');
                await pool.query(`
                    CREATE TABLE sesiones_movil (
                        id SERIAL PRIMARY KEY,
                        usuario_id TEXT,
                        empleado_id TEXT,
                        tipo VARCHAR(10) NOT NULL,
                        modo VARCHAR(20) NOT NULL DEFAULT 'offline',
                        fecha_evento TIMESTAMP NOT NULL,
                        dispositivo VARCHAR(50) DEFAULT 'movil',
                        recibido_at TIMESTAMP DEFAULT NOW()
                    )
                `);
                // Restaurar datos
                for (const row of backup.rows) {
                    await pool.query(
                        `INSERT INTO sesiones_movil (usuario_id, empleado_id, tipo, modo, fecha_evento, dispositivo, recibido_at)
                         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                        [row.usuario_id, row.empleado_id, row.tipo, row.modo, row.fecha_evento, row.dispositivo, row.recibido_at]
                    );
                }
                console.log(`🔧 [movilSync] Migración completada. ${backup.rows.length} registros restaurados.`);
            }
        } catch (migError) {
            console.error('⚠️ [movilSync] Error en migración FK (no crítico):', migError.message);
        }

        const sincronizados = [];
        const errores = [];

        for (const s of sesiones) {
            try {
                if (!s.usuario_id || !s.tipo || !s.fecha_evento) {
                    errores.push({ local_id: s.local_id, error: 'Campos requeridos faltantes' });
                    continue;
                }

                // FIX: verificar que el usuario existe antes de insertar
                // para no fallar silenciosamente por FK
                const usuarioExiste = await pool.query(
                    'SELECT id FROM usuarios WHERE id = $1',
                    [s.usuario_id]
                );

                if (usuarioExiste.rows.length === 0) {
                    errores.push({ local_id: s.local_id, error: `usuario_id ${s.usuario_id} no existe en BD` });
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
                console.error(`❌ [movilSync] Error insertando sesión local_id=${s.local_id}:`, sError.message);
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

/**
     * GET /api/movil/sync/dispositivos/:empleadoId
     * 
     * Verificación pública de dispositivos por empleado.
     * Devuelve la lista de dispositivos activos asociados al empleado.
     */
export const verificarDispositivosEmpleado = async (req, res) => {
    try {
        const { empleadoId } = req.params;

        if (!empleadoId) {
            return res.status(400).json({
                success: false,
                error: 'empleadoId es requerido'
            });
        }

        const resultado = await pool.query(`
            SELECT
                id,
                sistema_operativo,
                es_root,
                fecha_registro,
                ip,
                mac
            FROM movil
            WHERE empleado_id = $1 AND es_activo = true
        `, [empleadoId]);

        res.json({
            success: true,
            empleado_id: empleadoId,
            dispositivos: resultado.rows,
            total: resultado.rows.length
        });

    } catch (error) {
        console.error('❌ [movilSync] Error verificando dispositivos:', error);
        res.status(500).json({
            success: false,
            error: 'Error al verificar dispositivos del empleado'
        });
    }
};