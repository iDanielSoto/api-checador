import { pool } from '../config/db.js';

/**
 * GET /api/saas/metricas
 * Obtiene métricas globales de todo el ecosistema (solo para Propietarios SaaS)
 */
export async function getMetricasSaaS(req, res) {
    try {
        const cliente = await pool.connect();
        try {
            // Totales de empresas
            const empresasQuery = await cliente.query(`
                SELECT 
                    COUNT(*) as total,
                    SUM(CASE WHEN es_activo = true THEN 1 ELSE 0 END) as activas,
                    SUM(CASE WHEN es_activo = false THEN 1 ELSE 0 END) as inactivas
                FROM empresas
            `);

            // Total de empleados
            const empleadosQuery = await cliente.query(`
                SELECT COUNT(*) as total FROM empleados
            `);

            // Total de dispositivos (Sumando movil y escritorio)
            const dispositivosQuery = await cliente.query(`
                SELECT 
                    (SELECT COUNT(*) FROM movil) + 
                    (SELECT COUNT(*) FROM escritorio) as total
            `);

            // Total usuarios
            const usuariosQuery = await cliente.query(`
                SELECT COUNT(*) as total FROM usuarios
            `);

            const metricas = {
                empresas: {
                    total: parseInt(empresasQuery.rows[0].total) || 0,
                    activas: parseInt(empresasQuery.rows[0].activas) || 0,
                    inactivas: parseInt(empresasQuery.rows[0].inactivas) || 0
                },
                empleados: parseInt(empleadosQuery.rows[0].total) || 0,
                dispositivos: parseInt(dispositivosQuery.rows[0].total) || 0,
                usuarios: parseInt(usuariosQuery.rows[0].total) || 0
            };

            res.json({
                success: true,
                data: metricas
            });

        } finally {
            cliente.release();
        }
    } catch (error) {
        console.error('Error al obtener métricas SaaS:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor al obtener métricas'
        });
    }
}

/**
 * GET /api/saas/logs
 * Devuelve los últimos errores y eventos de la base de datos central.
 */
export async function getLogsSaaS(req, res) {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const offset = (page - 1) * limit;

        const nivelFiltro = req.query.nivel || null;

        let queryParams = [limit, offset];
        let baseQuery = `
            FROM system_logs l
            LEFT JOIN empresas e ON l.empresa_id = e.id
        `;
        let whereClauses = [];

        if (nivelFiltro) {
            whereClauses.push(`l.nivel = $3`);
            queryParams.push(nivelFiltro);
        }

        if (whereClauses.length > 0) {
            baseQuery += ` WHERE ` + whereClauses.join(' AND ');
        }

        const countQuery = `SELECT COUNT(*) ${baseQuery}`;
        const dataQuery = `
            SELECT l.id, l.nivel, l.mensaje, l.contexto, l.ruta, l.fecha, l.empresa_id, e.nombre as empresa_nombre
            ${baseQuery}
            ORDER BY l.fecha DESC
            LIMIT $1 OFFSET $2
        `;

        const [totalesRes, dataRes] = await Promise.all([
            pool.query(countQuery, queryParams.slice(2)), // El COUNT no usa LIMIT ni OFFSET 
            pool.query(dataQuery, queryParams)
        ]);

        const totalRow = totalesRes.rows[0]?.count || 0;

        res.json({
            success: true,
            data: dataRes.rows,
            meta: {
                total: parseInt(totalRow),
                page,
                limit,
                paginas: Math.ceil(parseInt(totalRow) / limit)
            }
        });

    } catch (error) {
        console.error('Error al obtener logs SaaS:', error);
        res.status(500).json({
            success: false,
            message: 'Error al recuperar la bitácora del sistema.'
        });
    }
}
