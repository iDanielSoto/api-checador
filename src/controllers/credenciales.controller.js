import { pool } from '../config/db.js';
import { generateId, ID_PREFIXES } from '../utils/idGenerator.js';
import { registrarEvento, TIPOS_EVENTO, PRIORIDADES } from '../utils/eventos.js';
import { extractDescriptorFromImage } from '../services/faceRecognition.service.js';

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

export async function getCredencialesPublico(req, res) {
    try {
        const { empresa_id } = req.query;

        if (!empresa_id) {
            return res.status(400).json({
                success: false,
                message: 'El parámetro empresa_id es requerido para listar credenciales.'
            });
        }

        const resultado = await pool.query(`
            SELECT c.id, c.empleado_id,
                CASE WHEN c.dactilar IS NOT NULL THEN true ELSE false END as tiene_dactilar,
                encode(c.dactilar, 'base64') as dactilar,
                CASE WHEN c.facial IS NOT NULL THEN true ELSE false END as tiene_facial,
                CASE WHEN c.pin IS NOT NULL THEN true ELSE false END as tiene_pin
            FROM credenciales c
            INNER JOIN empleados e ON e.id = c.empleado_id
            INNER JOIN usuarios u ON u.id = e.usuario_id
            WHERE c.dactilar IS NOT NULL AND u.empresa_id = $1
        `, [empresa_id]);

        res.json({ success: true, data: resultado.rows });
    } catch (error) {
        console.error('Error en getCredencialesPublico:', error);
        res.status(500).json({ success: false, message: 'Error al obtener credenciales' });
    }
}

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
        res.json({ success: true, data: { dactilar: dactilarBase64 } });
    } catch (error) {
        console.error('Error en getDactilarByEmpleado:', error);
        res.status(500).json({ success: false, message: 'Error al obtener huella' });
    }
}

// ========== IDENTIFICACIÓN FACIAL (PÚBLICO - sin autenticación) ==========

/**
 * POST /api/credenciales/facial/identify
 * Identificar empleado por descriptor facial (1:N matching)
 */
export async function identificarPorFacial(req, res) {
    try {
        const { facial, empresa_id } = req.body;
        if (!facial) {
            return res.status(400).json({ success: false, message: 'Se requiere el descriptor facial' });
        }
        if (!empresa_id) {
            return res.status(400).json({ success: false, message: 'Se requiere id_empresa para identificación facial' });
        }

        const resultado = await pool.query(`
            SELECT c.id, c.empleado_id, c.facial,
                e.rfc, e.nss, e.horario_id,
                u.id as usuario_id, u.nombre, u.correo, u.foto, u.empresa_id
            FROM credenciales c
            INNER JOIN empleados e ON e.id = c.empleado_id
            INNER JOIN usuarios u ON u.id = e.usuario_id
            WHERE c.facial IS NOT NULL AND u.empresa_id = $1
        `, [empresa_id]);

        if (resultado.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'No hay rostros registrados para esta empresa' });
        }

        const descriptorRecibido = base64ToFloat32Array(facial);
        let mejorMatch = null;
        let mejorDistancia = Infinity;
        const UMBRAL_DISTANCIA = 0.6;

        for (const cred of resultado.rows) {
            try {
                const descriptorRegistrado = byteaToFloat32Array(cred.facial);
                const distancia = calcularDistanciaEuclidiana(descriptorRecibido, descriptorRegistrado);
                
                if (distancia < mejorDistancia) {
                    mejorDistancia = distancia;
                    mejorMatch = cred;
                }
            } catch (err) {
                console.error(`Error procesando credencial ${cred.id}:`, err.message);
            }
        }

        if (mejorMatch && mejorDistancia < UMBRAL_DISTANCIA) {
            const matchScore = Math.round((1 - mejorDistancia) * 100);
            

            await registrarEvento({
                titulo: 'Identificación facial exitosa',
                descripcion: `${mejorMatch.nombre} identificado por reconocimiento facial`,
                tipo_evento: TIPOS_EVENTO.AUTENTICACION,
                prioridad: PRIORIDADES.BAJA,
                empleado_id: mejorMatch.empleado_id,
                detalles: { metodo: 'facial', matchScore, empresa_id: mejorMatch.empresa_id }
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

        
        return res.status(404).json({ success: false, message: 'Rostro no reconocido en el sistema' });

    } catch (error) {
        console.error('❌ Error en identificarPorFacial:', error);
        res.status(500).json({ success: false, message: 'Error interno del servidor' });
    }
}

/**
 * POST /api/credenciales/facial/verify-image
 * Valida imagen Base64 del móvil contra el descriptor guardado en DB.
 * Usa face-api.js en el servidor para extraer el descriptor.
 */
export async function verificarFacialPorImagen(req, res) {
    try {
        const { empleado_id, imagen_base64 } = req.body;

        if (!empleado_id || !imagen_base64) {
            return res.status(400).json({ success: false, message: 'Se requiere el empleado_id y la imagen_base64' });
        }

        // 1. Obtener descriptor guardado desde la DB
        const resultado = await pool.query(
            'SELECT facial FROM credenciales WHERE empleado_id = $1',
            [empleado_id]
        );

        if (resultado.rows.length === 0 || !resultado.rows[0].facial) {
            return res.status(404).json({ success: false, message: 'El empleado no tiene un rostro registrado en la base de datos' });
        }

        const descriptorRegistrado = byteaToFloat32Array(resultado.rows[0].facial);

        // 2. Extraer descriptor de la imagen recibida
        const base64Data = imagen_base64.replace(/^data:image\/\w+;base64,/, '');
        const imageBuffer = Buffer.from(base64Data, 'base64');

        
        const descriptorRecibido = await extractDescriptorFromImage(imageBuffer);

        if (!descriptorRecibido) {
            return res.status(400).json({ success: false, message: 'No se detectó ningún rostro válido en la imagen proporcionada' });
        }

        // 3. Comparar descriptores
        const UMBRAL_DISTANCIA = 0.6;
        const distancia = calcularDistanciaEuclidiana(descriptorRecibido, descriptorRegistrado);

        

        if (distancia < UMBRAL_DISTANCIA) {
            const matchScore = Math.round((1 - (distancia / 1.5)) * 100);
            
            return res.json({ success: true, message: 'Rostro verificado exitosamente', data: { matchScore, distancia } });
        }

        
        return res.status(400).json({ success: false, message: 'El rostro de la imagen no coincide con el registrado en el sistema' });

    } catch (error) {
        console.error('❌ Error en verificarFacialPorImagen:', error);
        res.status(500).json({ success: false, message: 'Error interno del servidor procesando la imagen' });
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
 * POST /api/credenciales/pin/login
 * Login de empleado mediante PIN (PÚBLICO)
 */
export async function loginPorPin(req, res) {
    try {
        const { usuario, pin, empresa_id } = req.body;
        if (!usuario || !pin) {
            return res.status(400).json({ success: false, message: 'Usuario y PIN son requeridos' });
        }
        if (!empresa_id) {
            return res.status(400).json({ success: false, message: 'Se requiere id_empresa para iniciar sesión' });
        }

        const resultado = await pool.query(`
            SELECT 
                c.pin, 
                e.id as empleado_id, e.rfc, e.nss, e.horario_id,
                u.id as usuario_id, u.nombre, u.correo, u.usuario,
                u.telefono, u.foto, u.es_empleado, u.empresa_id
            FROM credenciales c
            INNER JOIN empleados e ON e.id = c.empleado_id
            INNER JOIN usuarios u ON u.id = e.usuario_id
            WHERE (u.usuario = $1 OR u.correo = $1) AND u.empresa_id = $2
        `, [usuario, empresa_id]);

        if (resultado.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Usuario no encontrado o sin credenciales configuradas' });
        }

        const datos = resultado.rows[0];
        const pinRegistrado = String(datos.pin).trim();
        const pinIngresado = String(pin).trim();

        if (pinRegistrado !== pinIngresado) {
            return res.status(401).json({ success: false, message: 'PIN incorrecto' });
        }

        await registrarEvento({
            titulo: 'Login por PIN exitoso',
            descripcion: `${datos.nombre} inició sesión mediante PIN`,
            tipo_evento: TIPOS_EVENTO.AUTENTICACION,
            prioridad: PRIORIDADES.BAJA,
            empleado_id: datos.empleado_id,
            detalles: { metodo: 'pin', usuario: datos.usuario, empresa_id: datos.empresa_id }
        });

        res.json({
            success: true,
            message: 'Login correcto',
            data: {
                usuario: {
                    id: datos.usuario_id,
                    usuario: datos.usuario,
                    correo: datos.correo,
                    nombre: datos.nombre,
                    foto: datos.foto,
                    telefono: datos.telefono,
                    es_empleado: true,
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
                token: datos.usuario_id
            }
        });
    } catch (error) {
        console.error('Error en loginPorPin:', error);
        res.status(500).json({ success: false, message: 'Error al iniciar sesión con PIN' });
    }
}