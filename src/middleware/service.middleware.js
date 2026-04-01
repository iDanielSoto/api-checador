// service.middleware.js
const SERVICE_KEY = "tu_clave_secreta_muy_larga_y_segura_123456";

export function verificarServiceKey(req, res, next) {
    const serviceKey = req.headers['x-service-key'];

    if (!serviceKey || serviceKey !== SERVICE_KEY) {
        
        return res.status(401).json({
            success: false,
            message: 'Unauthorized'
        });
    }

    
    next();
}