import { pool } from '../config/db.js';
import { generateId, ID_PREFIXES } from '../utils/idGenerator.js';

/**
 * Obtener datos de referencia para sincronización descendente
 */
export async function getDatosReferencia(req, res) {
    try {
        const { desde } = req.query; // Timestamp opcional
        const esSyncCompleto = !desde;

        console.log(`[Sync] Obteniendo datos de referencia ${esSyncCompleto ? '(completo)' : '(incremental)'}`);

        // Consultar empleados activos
        const empleadosQuery = `
      SELECT
        e.id,
        u.nombre,
        e.usuario_id,
        e.horario_id,
        (u.estado_cuenta = 'activo') as es_activo,
        u.foto,
        e.rfc
      FROM empleados e
      INNER JOIN usuarios u ON u.id = e.usuario_id
      ${esSyncCompleto ? '' : 'WHERE GREATEST(EXTRACT(EPOCH FROM e.fecha_registro), EXTRACT(EPOCH FROM COALESCE(u.fecha_modificacion, e.fecha_registro))) * 1000 > $1'}
    `;

        const empleados = await pool.query(
            empleadosQuery,
            esSyncCompleto ? [] : [parseInt(desde)]
        );

        // Consultar horarios activos
        const horariosQuery = `
      SELECT
        id,
        configuracion,
        es_activo,
        fecha_inicio,
        fecha_fin
      FROM horarios
      WHERE es_activo = true
      ${esSyncCompleto ? '' : 'AND EXTRACT(EPOCH FROM COALESCE(fecha_modificacion, fecha_registro)) * 1000 > $1'}
    `;

        const horarios = await pool.query(
            horariosQuery,
            esSyncCompleto ? [] : [parseInt(desde)]
        );

        // Consultar tolerancias
        const tolerancias = await pool.query(`
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
    `);

        // Consultar usuarios_roles
        const usuarios_roles = await pool.query(`
      SELECT
        ur.usuario_id,
        ur.rol_id,
        r.tolerancia_id,
        r.posicion
      FROM usuarios_roles ur
      INNER JOIN roles r ON r.id = ur.rol_id
      WHERE ur.es_activo = true
    `);

        // Consultar empleados_departamentos
        const empleados_departamentos = await pool.query(`
      SELECT
        id,
        empleado_id,
        departamento_id,
        es_activo
      FROM empleados_departamentos
      WHERE es_activo = true
    `);

        // Consultar credenciales (solo para empleados activos)
        // NOTA: Las credenciales deben estar encriptadas
        const credenciales = await pool.query(`
      SELECT
        c.id,
        c.empleado_id,
        c.dactilar,
        c.facial,
        c.pin
      FROM credenciales c
      INNER JOIN empleados e ON e.id = c.empleado_id
      INNER JOIN usuarios u ON u.id = e.usuario_id
      WHERE u.estado_cuenta = 'activo'
    `);

        const timestamp = Date.now();

        // Responder con todos los datos
        res.json({
            empleados: empleados.rows,
            horarios: horarios.rows,
            tolerancias: tolerancias.rows,
            usuarios_roles: usuarios_roles.rows,
            empleados_departamentos: empleados_departamentos.rows,
            credenciales: credenciales.rows,
            timestamp
        });

        console.log(`[Sync] ✅ Datos de referencia enviados: ${empleados.rows.length} empleados`);

    } catch (error) {
        console.error('[Sync] ❌ Error obteniendo datos de referencia:', error);
        res.status(500).json({
            error: 'Error al sincronizar datos',
            message: error.message
        });
    }
}

/**
 * Sincronizar asistencias pendientes desde dispositivo
 */
export async function sincronizarAsistenciasPendientes(req, res) {
    try {
        const { registros } = req.body;

        if (!Array.isArray(registros) || registros.length === 0) {
            return res.status(400).json({
                error: 'Se requiere un array de registros'
            });
        }

        console.log(`[Sync] Procesando ${registros.length} asistencias pendientes...`);

        const sincronizados = [];
        const rechazados = [];

        // Procesar cada registro
        for (const registro of registros) {
            try {
                // Validar campos requeridos
                if (!registro.empleado_id || !registro.tipo || !registro.fecha_registro) {
                    rechazados.push({
                        id_local: registro.id,
                        error: 'Campos requeridos faltantes',
                        codigo: 'CAMPOS_FALTANTES'
                    });
                    continue;
                }

                // Verificar que el empleado existe y está activo
                const empleadoCheck = await pool.query(`
          SELECT e.id
          FROM empleados e
          INNER JOIN usuarios u ON u.id = e.usuario_id
          WHERE e.id = $1 AND u.estado_cuenta = 'activo'
        `, [registro.empleado_id]);

                if (empleadoCheck.rows.length === 0) {
                    rechazados.push({
                        id_local: registro.id,
                        error: 'Empleado no encontrado o inactivo',
                        codigo: 'EMPLEADO_NO_EXISTE'
                    });
                    continue;
                }

                // Verificar duplicados (misma fecha ±2 minutos y mismo tipo)
                const dosMinsAntes = registro.fecha_registro - (2 * 60 * 1000);
                const dosMinsDespues = registro.fecha_registro + (2 * 60 * 1000);

                const duplicadoCheck = await pool.query(`
          SELECT id
          FROM asistencias
          WHERE empleado_id = $1
            AND tipo = $2
            AND EXTRACT(EPOCH FROM fecha_registro) * 1000 BETWEEN $3 AND $4
          LIMIT 1
        `, [registro.empleado_id, registro.tipo, dosMinsAntes, dosMinsDespues]);

                if (duplicadoCheck.rows.length > 0) {
                    rechazados.push({
                        id_local: registro.id,
                        error: 'Registro duplicado detectado',
                        codigo: 'DUPLICADO'
                    });
                    continue;
                }

                // Generar ID del servidor
                const servidor_id = await generateId(ID_PREFIXES.ASISTENCIA);

                // Convertir timestamp a fecha PostgreSQL
                const fecha_registro = new Date(registro.fecha_registro);

                // Insertar en la base de datos
                await pool.query(`
          INSERT INTO asistencias (
            id,
            estado,
            dispositivo_origen,
            ubicacion,
            empleado_id,
            departamento_id,
            tipo,
            fecha_registro
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `, [
                    servidor_id,
                    registro.estado || registro.clasificacion,
                    registro.dispositivo_origen || 'escritorio',
                    registro.ubicacion,
                    registro.empleado_id,
                    registro.departamento_id,
                    registro.tipo,
                    fecha_registro
                ]);

                // Marcar como sincronizado
                sincronizados.push({
                    id_local: registro.id,
                    id_servidor: servidor_id,
                    fecha_servidor: fecha_registro.toISOString()
                });

                console.log(`[Sync] ✅ Asistencia sincronizada: ${registro.id} → ${servidor_id}`);

            } catch (error) {
                console.error(`[Sync] ❌ Error procesando registro ${registro.id}:`, error);
                rechazados.push({
                    id_local: registro.id,
                    error: error.message,
                    codigo: 'ERROR_SERVIDOR'
                });
            }
        }

        // Responder con resultados
        res.json({
            success: true,
            sincronizados,
            rechazados
        });

        console.log(`[Sync] ✅ Sincronización completada: ${sincronizados.length} éxitos, ${rechazados.length} rechazados`);

    } catch (error) {
        console.error('[Sync] ❌ Error en sincronización de asistencias:', error);
        res.status(500).json({
            error: 'Error al sincronizar asistencias',
            message: error.message
        });
    }
}
