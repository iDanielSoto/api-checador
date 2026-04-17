import { pool } from '../config/db.js';
import { generateId, ID_PREFIXES } from '../utils/idGenerator.js';
import { ejecutarValidacionesRed } from '../utils/networkValidator.js';
import {
    srvBuscarConfiguracion,
    srvObtenerTurnosDeHoy,
    srvBuscarBloqueActual,
    srvEvaluarEstado
} from '../services/asistencias.service.js';
import { extractDescriptorFromImage } from '../services/faceRecognition.service.js';

function base64ToFloat32Array(base64) {
    const buffer = Buffer.from(base64, 'base64');
    return new Float32Array(buffer.buffer, buffer.byteOffset, buffer.length / 4);
}

function byteaToFloat32Array(bytea) {
    if (Buffer.isBuffer(bytea)) {
        return new Float32Array(bytea.buffer, bytea.byteOffset, bytea.length / 4);
    }
    if (typeof bytea === 'string') {
        return base64ToFloat32Array(bytea);
    }
    throw new Error('Formato de BYTEA no reconocido');
}

function calcularDistanciaEuclidiana(desc1, desc2) {
    if (desc1.length !== desc2.length) {
        throw new Error(`Descriptores de diferente longitud: ${desc1.length} vs ${desc2.length}`);
    }
    let suma = 0;
    for (let i = 0; i < desc1.length; i++) {
        const diff = desc1[i] - desc2[i];
        suma += diff * diff;
    }
    return Math.sqrt(suma);
}

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
                    u.empresa_id,
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

        // ========== TOLERANCIA (vía empresa del usuario) ==========
        let tolerancia = null;
        try {
            if (empleado.empresa_id) {
                const configAsistencias = await srvBuscarConfiguracion(empleado.id, empleado.empresa_id);
                tolerancia = configAsistencias.tolerancia;
            }
        } catch (tolError) {
            console.error('❌ [movilSync] Error obteniendo configuración y tolerancia:', tolError);
            return res.status(500).json({ success: false, error: `Error en función srvBuscarConfiguracion: ${tolError.message}` });
        }

        // ========== DEPARTAMENTOS ==========
        let departamentos = [];
        try {
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
 * Re-evalúa el estado (puntual/retardo/etc) con la lógica real del servidor.
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

                // Verificar que el empleado existe y cargar su empresa
                const empCheck = await pool.query(
                    'SELECT e.id, e.horario_id, u.id as usuario_id, u.empresa_id, u.nombre as empleado_nombre FROM empleados e INNER JOIN usuarios u ON u.id = e.usuario_id WHERE e.id = $1',
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

                const fecha = reg.fecha_registro
                    ? new Date(reg.fecha_registro)
                    : new Date();

                const dosMinsAntes = new Date(fecha.getTime() - (2 * 60 * 1000));
                const dosMinsDespues = new Date(fecha.getTime() + (2 * 60 * 1000));

                const dupCheck = await pool.query(`
                  SELECT id, estado
                  FROM asistencias
                  WHERE empleado_id = $1
                    AND tipo = $2
                    AND fecha_registro BETWEEN $3 AND $4
                  LIMIT 1
                `, [reg.empleado_id, reg.tipo, dosMinsAntes, dosMinsDespues]);

                if (dupCheck.rows.length > 0) {
                    sincronizados.push({
                        id_local: reg.id,
                        id_servidor: dupCheck.rows[0].id,
                        estado: dupCheck.rows[0].estado,
                        tipo: reg.tipo
                    });
                    continue;
                }

                // --- Verificación Facial en Offline ---
                if (reg.metodo_registro === 'FACIAL') {
                    if (!reg.imagen_base64) {
                        rechazados.push({
                            id_local: reg.id,
                            error: 'Falta imagen facial para validación offline',
                            codigo: 'IMAGEN_FACIAL_FALTANTE'
                        });
                        continue;
                    }

                    try {
                        const resFacial = await pool.query('SELECT facial FROM credenciales WHERE empleado_id = $1', [reg.empleado_id]);
                        if (resFacial.rows.length === 0 || !resFacial.rows[0].facial) {
                            rechazados.push({
                                id_local: reg.id,
                                error: 'Empleado no tiene rostro registrado',
                                codigo: 'ROSTRO_NO_REGISTRADO'
                            });
                            continue;
                        }

                        const descriptorRegistrado = byteaToFloat32Array(resFacial.rows[0].facial);
                        const base64Data = reg.imagen_base64.replace(/^data:image\/\w+;base64,/, '');
                        const imageBuffer = Buffer.from(base64Data, 'base64');
                        const descriptorRecibido = await extractDescriptorFromImage(imageBuffer);

                        if (!descriptorRecibido) {
                            rechazados.push({
                                id_local: reg.id,
                                error: 'No se detectó un rostro válido en la imagen proporcionada',
                                codigo: 'ROSTRO_INVALIDO'
                            });
                            continue;
                        }

                        const UMBRAL_DISTANCIA = 0.6;
                        const distancia = calcularDistanciaEuclidiana(descriptorRecibido, descriptorRegistrado);

                        if (distancia >= UMBRAL_DISTANCIA) {
                            rechazados.push({
                                id_local: reg.id,
                                error: 'El rostro no coincide con el registrado (distancia: ' + distancia.toFixed(4) + ')',
                                codigo: 'IDENTIDAD_INVALIDA'
                            });
                            continue;
                        }
                    } catch (e) {
                        rechazados.push({
                            id_local: reg.id,
                            error: 'Error validando rostro: ' + e.message,
                            codigo: 'ERROR_VALIDACION_FACIAL'
                        });
                        continue;
                    }
                }

                // --- Re-evaluación del estado y captura del snapshot horario ---
                let estadoCalculado = reg.estado || reg.clasificacion || 'pendiente';
                let horarioSnapshot = null;
                let toleranciaCalc = null;

                try {
                    const empresaId = empCheck.rows[0].empresa_id;
                    if (empresaId) {
                        const { tolerancia, horario } = await srvBuscarConfiguracion(reg.empleado_id, empresaId);
                        toleranciaCalc = tolerancia; // Guardar en scope del for-loop

                        const fechaSync = new Date(fecha);
                        const minsHora = fechaSync.getHours() * 60 + fechaSync.getMinutes();
                        const turnosDiaSync = srvObtenerTurnosDeHoy(horario, fechaSync);
                        const bloqueSync = srvBuscarBloqueActual(
                            turnosDiaSync,
                            minsHora,
                            tolerancia.intervalo_bloques_minutos,
                            tolerancia.minutos_anticipado_max,
                            tolerancia.minutos_posterior_salida
                        );

                        estadoCalculado = srvEvaluarEstado(reg.tipo, minsHora, bloqueSync, tolerancia);

                        // Guardar snapshot del bloque vigente al momento del checado
                        if (bloqueSync) {
                            const minsToHHMM = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
                            horarioSnapshot = JSON.stringify({
                                inicio: minsToHHMM(bloqueSync.entrada),
                                fin: minsToHHMM(bloqueSync.salida),
                                turno_index: bloqueSync.index ?? null
                            });
                        }
                    }
                } catch (calcError) {
                    console.warn(`[movilSync] No se pudo recalcular estado de ${reg.empleado_id}. Usando original. Detalle:`, calcError.message);
                }

                // Generar ID
                // 1. IP del registro (mover fuera para depurar siempre)
                const ipReal = reg.ip || 'SIN_IP';
                const servidor_id = await generateId(ID_PREFIXES.ASISTENCIA);

                // --- Validar segmentos de red y GPS para esta asistencia ---
                let alertasReg = [];

                // Log preventivo para ver si entramos al flujo
                

                if (toleranciaCalc) {
                    try {
                        let segmentosRed = toleranciaCalc.segmentos_red || [];

                        let coordenadas = null;
                        if (reg.ubicacion && Array.isArray(reg.ubicacion) && reg.ubicacion.length >= 2) {
                            coordenadas = { lat: reg.ubicacion[0], lng: reg.ubicacion[1] };
                        } else if (reg.lat && reg.lng) {
                            coordenadas = { lat: reg.lat, lng: reg.lng };
                        }

                        let ubicacionDepartamento = null;
                        if (reg.departamento_id) {
                            const deptoQuery = await pool.query(
                                'SELECT ubicacion FROM departamentos WHERE id = $1',
                                [reg.departamento_id]
                            );
                            if (deptoQuery.rows.length > 0 && deptoQuery.rows[0].ubicacion) {
                                ubicacionDepartamento = deptoQuery.rows[0].ubicacion;
                            }
                        }

                        const segsLog = (segmentosRed && segmentosRed.length > 0) ? segmentosRed.join(', ') : 'NINGUNO (Abierto)';
                        const logGps = coordenadas ? `LatLng(${coordenadas.lat}, ${coordenadas.lng})` : 'SIN_COORDENADAS';
                        const logDepto = ubicacionDepartamento ? `${ubicacionDepartamento.zonas?.length || 1} geocerca(s)` : 'SIN_UBICACION_DEPARTAMENTO';
                        
                        const usuarioId = empCheck.rows[0].usuario_id;
                        const omitirRed = toleranciaCalc.omision_red_activa && (
                            toleranciaCalc.omision_red_empleados?.includes('*') || 
                            toleranciaCalc.omision_red_empleados?.includes(String(reg.empleado_id)) ||
                            toleranciaCalc.omision_red_empleados?.includes(String(usuarioId))
                        );
                        const omitirGps = toleranciaCalc.omision_gps_activa && (
                            toleranciaCalc.omision_gps_empleados?.includes('*') || 
                            toleranciaCalc.omision_gps_empleados?.includes(String(reg.empleado_id)) ||
                            toleranciaCalc.omision_gps_empleados?.includes(String(usuarioId))
                        );

                        if (omitirRed || omitirGps) {
                            
                        }

                        

                        const validacion = ejecutarValidacionesRed({
                            ip: reg.ip || null,
                            segmentosRed,
                            coordenadas,
                            ubicacionDepartamento,
                            wifi: reg.wifi || null,
                            omitirRed,
                            omitirGps
                        });

                        alertasReg = validacion.alertas;

                        if (alertasReg.length > 0) {
                            console.warn(`[movilSync] RECHAZO PERIMETRO para empleado ${reg.empleado_id}. Fallos detectados:`, alertasReg.map(a => a.tipo).join(', '));
                        }
                    } catch (netErr) {
                        console.error('[movilSync] Error al validar red/gps:', netErr.message);
                    }
                }

                // RECHAZO ESTRICTO DE PERÍMETRO
                if (alertasReg.length > 0) {
                    rechazados.push({
                        id_local: reg.id,
                        error: `Validación rechazada: ${alertasReg.map(a => a.mensaje).join(' | ')}`,
                        codigo: 'PERIMETRO_INVALIDO'
                    });
                    continue;
                }

                // Insertar registro con estado real y snapshot del horario
                await pool.query(`
                    INSERT INTO asistencias
                    (id, empleado_id, tipo, estado, departamento_id,
                     dispositivo_origen, fecha_registro, ubicacion, alertas, horario_snapshot, empresa_id, horario_id)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
                `, [
                    servidor_id,
                    reg.empleado_id,
                    reg.tipo,
                    estadoCalculado,
                    reg.departamento_id || null,
                    reg.dispositivo_origen || 'movil',
                    fecha,
                    reg.ubicacion || null,
                    JSON.stringify(alertasReg),
                    horarioSnapshot,
                    empCheck.rows[0].empresa_id,
                    empCheck.rows[0].horario_id
                ]);

                // Registrar evento de auditoría para la sincronización
                const eventoId = await generateId(ID_PREFIXES.EVENTO);
                const fechaSql = fecha.toLocaleString('sv-SE', { timeZone: 'America/Mexico_City' });
                await pool.query(
                    `INSERT INTO eventos(id, titulo, descripcion, tipo_evento, prioridad, empleado_id, detalles, fecha_registro) 
                     VALUES($1, $2, $3, 'asistencia', 'baja', $4, $5, $6)`,
                    [
                        eventoId, 
                        `Sincronización de ${reg.tipo} - ${estadoCalculado}`, 
                        `${empCheck.rows[0].empleado_nombre} sincronizó ${reg.tipo} (offline)`, 
                        reg.empleado_id, 
                        JSON.stringify({ 
                            asistencia_id: servidor_id, 
                            estado: estadoCalculado, 
                            tipo: reg.tipo, 
                            metodo: reg.metodo_registro ? reg.metodo_registro.toLowerCase() : 'desconocido',
                            modo: 'offline_sync'
                        }), 
                        fechaSql
                    ]
                );

                sincronizados.push({
                    id_local: reg.id,
                    id_servidor: servidor_id,
                    estado: estadoCalculado,
                    tipo: reg.tipo
                });

            } catch (regError) {
                rechazados.push({
                    id_local: reg.id,
                    error: regError.message,
                    codigo: 'ERROR_INTERNO'
                });
            }
        }

        

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
                for (const row of backup.rows) {
                    await pool.query(
                        `INSERT INTO sesiones_movil (usuario_id, empleado_id, tipo, modo, fecha_evento, dispositivo, recibido_at)
                         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                        [row.usuario_id, row.empleado_id, row.tipo, row.modo, row.fecha_evento, row.dispositivo, row.recibido_at]
                    );
                }
                
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