export const ASISTENCIA = {
    MINUTOS_SEPARACION_TURNOS: 15,
    TOLERANCIA_DEFECTO: {
        minutos_retardo: 10,
        minutos_falta: 30,
        permite_registro_anticipado: true,
        minutos_anticipado_max: 60,
        aplica_tolerancia_salida: false
    }
};

export const HTTP_STATUS = {
    OK: 200,
    CREATED: 201,
    BAD_REQUEST: 400,
    UNAUTHORIZED: 401,
    FORBIDDEN: 403,
    NOT_FOUND: 404,
    INTERNAL_SERVER_ERROR: 500
};
