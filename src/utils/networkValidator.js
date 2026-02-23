/**
 * networkValidator.js
 * 
 * Utilidades de validación de red para solicitudes y asistencias móviles.
 * 
 * Soporta tres tipos de validaciones (estructura extensible):
 *  - CIDR / Segmentos de red:  Compara la IP del cliente contra los segmentos
 *    configurados en `configuraciones.segmentos_red`.
 *  - GPS / Geofencing:         Compara coordenadas contra la ubicación del
 *    departamento con un radio configurable. (lógica futura en app móvil)
 *  - WiFi / Triangulación:     Compara el BSSID/SSID reportado contra la
 *    infraestructura de red configurada. (lógica futura)
 */

// ---------------------------------------------------------------------------
// Helpers CIDR
// ---------------------------------------------------------------------------

/**
 * Convierte una dirección IPv4 a número de 32 bits.
 * @param {string} ip - Ej. "192.168.1.5"
 * @returns {number}
 */
function ipToInt(ip) {
    return ip.split('.').reduce((acc, oct) => (acc << 8) + parseInt(oct, 10), 0) >>> 0;
}

/**
 * Comprueba si una IPv4 pertenece a un bloque CIDR.
 * @param {string} ip     - IP a evaluar, ej. "192.168.1.100"
 * @param {string} cidr   - Bloque CIDR, ej. "192.168.1.0/24"
 * @returns {boolean}
 */
export function ipEnCIDR(ip, cidr) {
    try {
        const [red, bits] = cidr.split('/');
        const mascara = bits === '0' ? 0 : (~0 << (32 - parseInt(bits, 10))) >>> 0;
        return (ipToInt(ip) & mascara) === (ipToInt(red) & mascara);
    } catch {
        return false;
    }
}

/**
 * Extrae la primera IPv4 válida de un string que puede contener
 * múltiples IPs separadas por coma o espacio (ej. el campo `ip`
 * de solicitudes puede llegar como "10.0.0.1, 192.168.1.5").
 * @param {string|null} ipString
 * @returns {string|null}
 */
export function extraerIPv4(ipString) {
    if (!ipString) return null;
    const partes = ipString.split(/[,\s]+/);
    const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
    return partes.find(p => ipv4Regex.test(p.trim())) || null;
}

// ---------------------------------------------------------------------------
// Validación principal de segmentos de red (CIDR)
// ---------------------------------------------------------------------------

/**
 * Evalúa si una IP pertenece a alguno de los segmentos de red configurados
 * para la empresa.
 *
 * @param {string|null}   ip              - IP a evaluar
 * @param {string[]}      segmentosRed    - Array de CIDRs, ej. ["192.168.1.0/24"]
 * @returns {{ valido: boolean, ip: string|null, segmentoCoincidente: string|null, advertencia: object|null }}
 */
export function validarSegmentoRed(ip, segmentosRed) {
    const ipLimpia = extraerIPv4(ip);

    // Si no hay segmentos configurados, no se aplica ninguna restricción
    if (!segmentosRed || segmentosRed.length === 0) {
        return { valido: true, ip: ipLimpia, segmentoCoincidente: null, advertencia: null };
    }

    // Si no se tiene IP del cliente, se marca como advertencia informativa
    if (!ipLimpia) {
        return {
            valido: false,
            ip: null,
            segmentoCoincidente: null,
            advertencia: {
                tipo: 'red_sin_ip',
                severidad: 'media',
                mensaje: 'No se pudo determinar la IP del dispositivo',
                detalle: { ip_recibida: ip }
            }
        };
    }

    const segmentoCoincidente = segmentosRed.find(cidr => ipEnCIDR(ipLimpia, cidr));

    if (segmentoCoincidente) {
        return { valido: true, ip: ipLimpia, segmentoCoincidente, advertencia: null };
    }

    return {
        valido: false,
        ip: ipLimpia,
        segmentoCoincidente: null,
        advertencia: {
            tipo: 'red_fuera_segmento',
            severidad: 'alta',
            mensaje: `La IP ${ipLimpia} no pertenece a ningún segmento de red autorizado`,
            detalle: {
                ip: ipLimpia,
                segmentos_configurados: segmentosRed
            }
        }
    };
}

// ---------------------------------------------------------------------------
// Validación GPS / Geofencing  (estructura lista, lógica en app móvil)
// ---------------------------------------------------------------------------

/**
 * Evalúa si unas coordenadas GPS están dentro del radio de un departamento.
 * El móvil debe enviar { lat, lng } y el departamento debe tener
 * { latitud, longitud, radio_metros } en su columna `ubicacion`.
 *
 * Por ahora solo construye la estructura de advertencia; la lógica real
 * se implementará cuando el app móvil envíe las coordenadas.
 *
 * @param {{ lat: number, lng: number }|null} coordenadasDispositivo
 * @param {{ latitud: number, longitud: number, radio_metros: number }|null} ubicacionDepartamento
 * @returns {{ valido: boolean, advertencia: object|null }}
 */
export function validarGPS(coordenadasDispositivo, ubicacionDepartamento) {
    // Sin datos suficientes, no se puede validar → no se genera error
    if (!coordenadasDispositivo || !ubicacionDepartamento?.latitud) {
        return { valido: true, advertencia: null };
    }

    const { lat, lng } = coordenadasDispositivo;
    const { latitud, longitud, radio_metros = 200 } = ubicacionDepartamento;

    const distancia = haversineMetros(lat, lng, latitud, longitud);

    if (distancia <= radio_metros) {
        return { valido: true, advertencia: null };
    }

    return {
        valido: false,
        advertencia: {
            tipo: 'gps_fuera_zona',
            severidad: 'alta',
            mensaje: `El dispositivo está a ${Math.round(distancia)}m del punto autorizado (radio: ${radio_metros}m)`,
            detalle: { lat, lng, distancia_metros: Math.round(distancia), radio_metros }
        }
    };
}

// ---------------------------------------------------------------------------
// Validación WiFi / Triangulación  (estructura lista, lógica pendiente)
// ---------------------------------------------------------------------------

/**
 * Evalúa si la red WiFi reportada por el móvil pertenece a la
 * infraestructura de red de la empresa.
 *
 * Por ahora es un stub que registra la estructura para uso futuro.
 * El app móvil deberá enviar { bssid, ssid } en los registros.
 *
 * @param {{ bssid: string, ssid: string }|null} wifiDispositivo
 * @param {string[]} redesAutorizadas  - Array de BSSIDs o SSIDs autorizados
 * @returns {{ valido: boolean, advertencia: object|null }}
 */
export function validarWifi(wifiDispositivo, redesAutorizadas) {
    if (!wifiDispositivo || !redesAutorizadas || redesAutorizadas.length === 0) {
        return { valido: true, advertencia: null };
    }

    const { bssid, ssid } = wifiDispositivo;
    const normalizado = (bssid || ssid || '').toLowerCase();
    const autorizado = redesAutorizadas.some(r => r.toLowerCase() === normalizado);

    if (autorizado) {
        return { valido: true, advertencia: null };
    }

    return {
        valido: false,
        advertencia: {
            tipo: 'wifi_no_autorizado',
            severidad: 'media',
            mensaje: `La red WiFi "${ssid || bssid}" no está en la lista de redes autorizadas`,
            detalle: { bssid, ssid, redes_autorizadas: redesAutorizadas }
        }
    };
}

// ---------------------------------------------------------------------------
// Función de conveniencia: construye el array de alertas combinado
// ---------------------------------------------------------------------------

/**
 * Ejecuta todas las validaciones disponibles y retorna el listado de alertas
 * generadas (si las hay).
 *
 * @param {object} params
 * @param {string|null}   params.ip                    - IP del cliente
 * @param {string[]}      params.segmentosRed          - CIDRs configurados
 * @param {{ lat, lng }|null} params.coordenadas       - GPS del dispositivo
 * @param {object|null}   params.ubicacionDepartamento - Datos del depto con radio
 * @param {{ bssid, ssid }|null} params.wifi           - Datos WiFi
 * @param {string[]}      params.redesWifiAutorizadas  - BSSIDs/SSIDs autorizados
 * @returns {{ alertas: object[], fueraDeRed: boolean }}
 */
export function ejecutarValidacionesRed({
    ip = null,
    segmentosRed = [],
    coordenadas = null,
    ubicacionDepartamento = null,
    wifi = null,
    redesWifiAutorizadas = []
} = {}) {
    const alertas = [];

    const redResult = validarSegmentoRed(ip, segmentosRed);
    if (redResult.advertencia) alertas.push(redResult.advertencia);

    const gpsResult = validarGPS(coordenadas, ubicacionDepartamento);
    if (gpsResult.advertencia) alertas.push(gpsResult.advertencia);

    const wifiResult = validarWifi(wifi, redesWifiAutorizadas);
    if (wifiResult.advertencia) alertas.push(wifiResult.advertencia);

    return {
        alertas,
        fueraDeRed: !redResult.valido
    };
}

// ---------------------------------------------------------------------------
// Utilidad Haversine (distancia entre dos coordenadas GPS en metros)
// ---------------------------------------------------------------------------

function haversineMetros(lat1, lon1, lat2, lon2) {
    const R = 6371000; // Radio de la Tierra en metros
    const toRad = deg => (deg * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
