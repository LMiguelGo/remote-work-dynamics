// Fabrica de limitadores de cuota (rate limiting) sobre express-rate-limit.
// Centraliza las opciones comunes para no repetirlas en cada ruta:
//  - standardHeaders: true  -> cabeceras RateLimit-* estandar (borrador IETF).
//  - legacyHeaders: false   -> sin las antiguas X-RateLimit-*.
//  - respuesta 429 con JSON claro.
// Mitiga fuerza bruta en /login (OWASP ASVS) y abuso de /ingesta (OWASP API4).

const rateLimit = require('express-rate-limit');

function crearLimitador({ windowMs, max, mensaje }) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: mensaje || 'Demasiadas peticiones, intente mas tarde.' },
  });
}

module.exports = { crearLimitador };
