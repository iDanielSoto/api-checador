import { pool } from '../config/db.js';
import { generateId, ID_PREFIXES } from '../utils/idGenerator.js';
import { registrarEvento, TIPOS_EVENTO, PRIORIDADES } from '../utils/eventos.js';

export async function getCredenciales(req, res) {
    try {
        const resultado = await pool.query(`
            SELECT c.id, c.empleado_id, c.fecha_registro,
                CASE WHEN c.dactilar IS NOT NULL THEN true ELSE false END as tiene_dactilar,
                CASE WHEN c.facial IS NOT NULL THEN true ELSE false END as tiene_facial,
                CASE WHEN c.pin IS NOT NULL THEN true ELSE false END as tiene_pin,
                u.nombre as empleado_nombre
            FROM credenciales c
            INNER JOIN empleados e ON e.id = c.empleado_id
            INNER JOIN usuarios u ON u.id = e.usuario_id
            ORDER BY c.fecha_registro DESC
        `);
        res.json({ success: true, data: resultado.rows });
    } catch (error) {
        console.error('Error en getCredenciales:', error);
        res.status(500).json({ success: false, message: 'Error al obtener credenciales' });
    }
}

export async function getCredencialesByEmpleado(req, res) {
    try {
        const { empleadoId } = req.params;
        const resultado = await pool.query(`
            SELECT id, empleado_id, fecha_registro,
                CASE WHEN dactilar IS NOT NULL THEN true ELSE false END as tiene_dactilar,
                CASE WHEN facial IS NOT NULL THEN true ELSE false END as tiene_facial,
                CASE WHEN pin IS NOT NULL THEN true ELSE false END as tiene_pin
            FROM credenciales WHERE empleado_id = $1
        `, [empleadoId]);
        if (resultado.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Credenciales no encontradas' });
        }
        res.json({ success: true, data: resultado.rows[0] });
    } catch (error) {
        console.error('Error en getCredencialesByEmpleado:', error);
        res.status(500).json({ success: false, message: 'Error al obtener credenciales' });
    }
}

export async function guardarDactilar(req, res) {
    try {
        const { empleado_id, dactilar } = req.body;
        if (!empleado_id || !dactilar) {
            return res.status(400).json({ success: false, message: 'empleado_id y dactilar son requeridos' });
        }
        const existe = await pool.query('SELECT id FROM credenciales WHERE empleado_id = $1', [empleado_id]);
        if (existe.rows.length > 0) {
            await pool.query('UPDATE credenciales SET dactilar = $1 WHERE empleado_id = $2', [Buffer.from(dactilar, 'base64'), empleado_id]);
        } else {
            const id = await generateId(ID_PREFIXES.CREDENCIAL);
            await pool.query('INSERT INTO credenciales (id, empleado_id, dactilar) VALUES ($1, $2, $3)', [id, empleado_id, Buffer.from(dactilar, 'base64')]);
        }
        // Registrar evento
        await registrarEvento({
            titulo: 'Huella dactilar registrada',
            descripcion: `Se registró/actualizó huella dactilar del empleado ${empleado_id}`,
            tipo_evento: TIPOS_EVENTO.CREDENCIAL,
            prioridad: PRIORIDADES.MEDIA,
            empleado_id: empleado_id,
            usuario_modificador_id: req.usuario?.id,
            detalles: { tipo: 'dactilar' }
        });

        res.json({ success: true, message: 'Huella dactilar guardada' });
    } catch (error) {
        console.error('Error en guardarDactilar:', error);
        res.status(500).json({ success: false, message: 'Error al guardar huella' });
    }
}

export async function guardarFacial(req, res) {
    try {
        const { empleado_id, facial } = req.body;
        if (!empleado_id || !facial) {
            return res.status(400).json({ success: false, message: 'empleado_id y facial son requeridos' });
        }
        const existe = await pool.query('SELECT id FROM credenciales WHERE empleado_id = $1', [empleado_id]);
        if (existe.rows.length > 0) {
            await pool.query('UPDATE credenciales SET facial = $1 WHERE empleado_id = $2', [Buffer.from(facial, 'base64'), empleado_id]);
        } else {
            const id = await generateId(ID_PREFIXES.CREDENCIAL);
            await pool.query('INSERT INTO credenciales (id, empleado_id, facial) VALUES ($1, $2, $3)', [id, empleado_id, Buffer.from(facial, 'base64')]);
        }
        // Registrar evento
        await registrarEvento({
            titulo: 'Datos faciales registrados',
            descripcion: `Se registraron/actualizaron datos faciales del empleado ${empleado_id}`,
            tipo_evento: TIPOS_EVENTO.CREDENCIAL,
            prioridad: PRIORIDADES.MEDIA,
            empleado_id: empleado_id,
            usuario_modificador_id: req.usuario?.id,
            detalles: { tipo: 'facial' }
        });

        res.json({ success: true, message: 'Datos faciales guardados' });
    } catch (error) {
        console.error('Error en guardarFacial:', error);
        res.status(500).json({ success: false, message: 'Error al guardar datos faciales' });
    }
}

export async function guardarPin(req, res) {
    try {
        const { empleado_id, pin } = req.body;
        if (!empleado_id || !pin) {
            return res.status(400).json({ success: false, message: 'empleado_id y pin son requeridos' });
        }
        if (pin.length !== 6 || !/^\d+$/.test(pin)) {
            return res.status(400).json({ success: false, message: 'El PIN debe ser de 6 dígitos' });
        }
        const existe = await pool.query('SELECT id FROM credenciales WHERE empleado_id = $1', [empleado_id]);
        if (existe.rows.length > 0) {
            await pool.query('UPDATE credenciales SET pin = $1 WHERE empleado_id = $2', [pin, empleado_id]);
        } else {
            const id = await generateId(ID_PREFIXES.CREDENCIAL);
            await pool.query('INSERT INTO credenciales (id, empleado_id, pin) VALUES ($1, $2, $3)', [id, empleado_id, pin]);
        }
        // Registrar evento
        await registrarEvento({
            titulo: 'PIN registrado',
            descripcion: `Se registró/actualizó PIN del empleado ${empleado_id}`,
            tipo_evento: TIPOS_EVENTO.CREDENCIAL,
            prioridad: PRIORIDADES.MEDIA,
            empleado_id: empleado_id,
            usuario_modificador_id: req.usuario?.id,
            detalles: { tipo: 'pin' }
        });

        res.json({ success: true, message: 'PIN guardado' });
    } catch (error) {
        console.error('Error en guardarPin:', error);
        res.status(500).json({ success: false, message: 'Error al guardar PIN' });
    }
}

export async function verificarPin(req, res) {
    try {
        const { empleado_id, pin } = req.body;
        const resultado = await pool.query('SELECT pin FROM credenciales WHERE empleado_id = $1', [empleado_id]);
        if (resultado.rows.length === 0 || !resultado.rows[0].pin) {
            return res.status(404).json({ success: false, message: 'PIN no configurado' });
        }
        const valido = resultado.rows[0].pin === pin;
        res.json({ success: true, data: { valido } });
    } catch (error) {
        console.error('Error en verificarPin:', error);
        res.status(500).json({ success: false, message: 'Error al verificar PIN' });
    }
}

export async function eliminarCredencial(req, res) {
    try {
        const { empleadoId } = req.params;
        const { tipo } = req.query;
        if (tipo === 'todo') {
            await pool.query('DELETE FROM credenciales WHERE empleado_id = $1', [empleadoId]);
        } else if (['dactilar', 'facial', 'pin'].includes(tipo)) {
            await pool.query(`UPDATE credenciales SET ${tipo} = NULL WHERE empleado_id = $1`, [empleadoId]);
        } else {
            return res.status(400).json({ success: false, message: 'tipo inválido' });
        }
        // Registrar evento
        await registrarEvento({
            titulo: 'Credencial eliminada',
            descripcion: `Se eliminó credencial (${tipo}) del empleado ${empleadoId}`,
            tipo_evento: TIPOS_EVENTO.CREDENCIAL,
            prioridad: PRIORIDADES.ALTA,
            empleado_id: empleadoId,
            usuario_modificador_id: req.usuario?.id,
            detalles: { tipo }
        });

        res.json({ success: true, message: 'Credencial eliminada' });
    } catch (error) {
        console.error('Error en eliminarCredencial:', error);
        res.status(500).json({ success: false, message: 'Error al eliminar credencial' });
    }
}

// ========== ENDPOINTS PÚBLICOS (sin autenticación) ==========
// Obtener lista de credenciales con huella dactilar
export async function getCredencialesPublico(req, res) {
    try {
        const resultado = await pool.query(`
            SELECT c.id, c.empleado_id,
                CASE WHEN c.dactilar IS NOT NULL THEN true ELSE false END as tiene_dactilar,
                CASE WHEN c.facial IS NOT NULL THEN true ELSE false END as tiene_facial,
                CASE WHEN c.pin IS NOT NULL THEN true ELSE false END as tiene_pin
            FROM credenciales c
            WHERE c.dactilar IS NOT NULL
        `);
        res.json({ success: true, data: resultado.rows });
    } catch (error) {
        console.error('Error en getCredencialesPublico:', error);
        res.status(500).json({ success: false, message: 'Error al obtener credenciales' });
    }
}

// Obtener huella dactilar de un empleado específico
export async function getDactilarByEmpleado(req, res) {
    try {
        const { empleadoId } = req.params;
        const resultado = await pool.query(
            'SELECT dactilar FROM credenciales WHERE empleado_id = $1',
            [empleadoId]
        );

        if (resultado.rows.length === 0 || !resultado.rows[0].dactilar) {
            return res.status(404).json({ success: false, message: 'Huella no encontrada' });
        }

        const dactilarBase64 = resultado.rows[0].dactilar.toString('base64');

        res.json({
            success: true,
            data: { dactilar: dactilarBase64 }
        });
    } catch (error) {
        console.error('Error en getDactilarByEmpleado:', error);
        res.status(500).json({ success: false, message: 'Error al obtener huella' });
    }
}

// ========== IDENTIFICACIÓN FACIAL (PÚBLICO - sin autenticación) ==========

/**
 * POST /api/credenciales/facial/identify
 * Identificar empleado por descriptor facial (1:N matching)
 * NO requiere autenticación (es método de login)
 */
export async function identificarPorFacial(req, res) {
    try {
        const { facial } = req.body;

        if (!facial) {
            return res.status(400).json({
                success: false,
                message: 'Se requiere el descriptor facial'
            });
        }

        // Obtener todas las credenciales con descriptor facial registrado
        const resultado = await pool.query(`
            SELECT c.id, c.empleado_id, c.facial,
    e.rfc, e.nss, e.horario_id,
    u.id as usuario_id, u.nombre, u.correo, u.foto
            FROM credenciales c
            INNER JOIN empleados e ON e.id = c.empleado_id
            INNER JOIN usuarios u ON u.id = e.usuario_id
            WHERE c.facial IS NOT NULL
        `);

        if (resultado.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'No hay descriptores faciales registrados en el sistema'
            });
        }

        // Convertir el descriptor recibido de Base64 a Float32Array
        const descriptorRecibido = base64ToFloat32Array(facial);

        let mejorMatch = null;
        let mejorDistancia = Infinity;
        const UMBRAL_DISTANCIA = 0.6; // Menor = más estricto

        // Comparar contra cada descriptor registrado
        for (const cred of resultado.rows) {
            try {
                // Convertir BYTEA a Float32Array
                const descriptorRegistrado = byteaToFloat32Array(cred.facial);

                // Calcular distancia euclidiana
                const distancia = calcularDistanciaEuclidiana(descriptorRecibido, descriptorRegistrado);

                console.log(`Comparando con empleado ${cred.empleado_id}: distancia = ${distancia.toFixed(4)} `);

                if (distancia < mejorDistancia) {
                    mejorDistancia = distancia;
                    mejorMatch = cred;
                }
            } catch (err) {
                console.error(`Error procesando credencial ${cred.id}: `, err.message);
            }
        }

        // Verificar si el mejor match está dentro del umbral
        if (mejorMatch && mejorDistancia < UMBRAL_DISTANCIA) {
            const matchScore = Math.round((1 - mejorDistancia) * 100);

            console.log(`✅ Match facial encontrado: empleado ${mejorMatch.empleado_id}, score: ${matchScore}% `);

            // Registrar evento
            await registrarEvento({
                titulo: 'Identificación facial exitosa',
                descripcion: `${mejorMatch.nombre} identificado por reconocimiento facial`,
                tipo_evento: TIPOS_EVENTO.AUTENTICACION,
                prioridad: PRIORIDADES.BAJA,
                empleado_id: mejorMatch.empleado_id,
                detalles: { metodo: 'facial', matchScore }
            });

            return res.json({
                success: true,
                message: 'Empleado identificado exitosamente',
                data: {
                    empleado: {
                        id_empleado: mejorMatch.empleado_id,
                        id_usuario: mejorMatch.usuario_id,
                        nombre: mejorMatch.nombre,
                        correo: mejorMatch.correo,
                        rfc: mejorMatch.rfc,
                        nss: mejorMatch.nss,
                        horario_id: mejorMatch.horario_id,
                        foto: mejorMatch.foto
                    },
                    matchScore
                }
            });
        }

        // No se encontró match
        console.log(`❌ Sin match facial.Mejor distancia: ${mejorDistancia.toFixed(4)}, umbral: ${UMBRAL_DISTANCIA} `);

        return res.status(404).json({
            success: false,
            message: 'Rostro no reconocido en el sistema'
        });

    } catch (error) {
        console.error('❌ Error en identificarPorFacial:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor'
        });
    }
}

// ========== Funciones auxiliares para descriptores faciales ==========

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
        throw new Error(`Descriptores de diferente longitud: ${desc1.length} vs ${desc2.length} `);
    }
    let suma = 0;
    for (let i = 0; i < desc1.length; i++) {
        const diff = desc1[i] - desc2[i];
        suma += diff * diff;
    }
    return Math.sqrt(suma);
}

/**
 * POST /api/credenciales/pin/login
 * Login de empleado mediante PIN (PÚBLICO)
 * Retorna datos del empleado si el PIN es correcto
 */
export async function loginPorPin(req, res) {
    try {
        const { usuario, pin } = req.body;
        if (!usuario || !pin) {
            return res.status(400).json({
                success: false,
                message: 'Usuario y PIN son requeridos'
            });
        }
        // Obtener credenciales y datos del empleado buscando por usuario o correo
        const resultado = await pool.query(`
            SELECT 
                c.pin, 
                e.id as empleado_id, 
                e.rfc, 
                e.nss, 
                e.horario_id,
                u.id as usuario_id, 
                u.nombre, 
                u.correo, 
                u.usuario,
                u.foto,
                u.es_empleado
            FROM credenciales c
            INNER JOIN empleados e ON e.id = c.empleado_id
            INNER JOIN usuarios u ON u.id = e.usuario_id
            WHERE (u.usuario = $1 OR u.correo = $1)
        `, [usuario]);
        if (resultado.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Usuario no encontrado o sin credenciales configuradas'
            });
        }
        const datos = resultado.rows[0];
        // Verificar PIN
        // NOTA: El PIN en base de datos puede ser numérico o string.
        // Convertimos ambos a string para comparación segura.
        const pinRegistrado = String(datos.pin).trim();
        const pinIngresado = String(pin).trim();
        if (pinRegistrado !== pinIngresado) {
            return res.status(401).json({
                success: false,
                message: 'PIN incorrecto'
            });
        }
        // Registrar evento de autenticación
        await registrarEvento({
            titulo: 'Login por PIN exitoso',
            descripcion: `${datos.nombre} inició sesión mediante PIN`,
            tipo_evento: TIPOS_EVENTO.AUTENTICACION,
            prioridad: PRIORIDADES.BAJA,
            empleado_id: datos.empleado_id,
            detalles: { metodo: 'pin', usuario: datos.usuario }
        });
        // Retornar datos del empleado y usuario estructurados
        res.json({
            success: true,
            message: 'Login correcto',
            data: {
                // Estructura compatible con lo que espera el frontend
                usuario: {
                    id: datos.usuario_id,
                    usuario: datos.usuario,
                    correo: datos.correo,
                    nombre: datos.nombre,
                    foto: datos.foto,
                    es_empleado: true, // Si tiene credenciales, es empleado
                    empleado_id: datos.empleado_id
                },
                empleado: {
                    id: datos.empleado_id,
                    usuario_id: datos.usuario_id,
                    nombre: datos.nombre,
                    rfc: datos.rfc,
                    nss: datos.nss,
                    horario_id: datos.horario_id
                },
                token: datos.usuario_id // Token simple por ahora, igual que en auth.controller
            }
        });
    } catch (error) {
        console.error('Error en loginPorPin:', error);
        res.status(500).json({
            success: false,
            message: 'Error al iniciar sesión con PIN'
        });
    }
}