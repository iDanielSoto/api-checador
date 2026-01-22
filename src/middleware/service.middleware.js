// service.middleware.js
const SERVICE_KEY = "tu_clave_secreta_muy_larga_y_segura_123456";

export function verificarServiceKey(req, res, next) {
    const serviceKey = req.headers['x-service-key'];

    if (!serviceKey || serviceKey !== SERVICE_KEY) {
        console.log('[Service] Clave inválida o no proporcionada');
        return res.status(401).json({
            success: false,
            message: 'Unauthorized'
        });
    }

    console.log('[Service] Clave válida - acceso permitido');
    next();
}