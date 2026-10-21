// Politica de contrasenas y generacion de claves temporales.
// Base: NIST SP 800-63B y OWASP Authentication Cheat Sheet.
//  - Longitud minima alta, sin reglas de composicion obligatorias.
//  - Se admiten frases largas; el tope cuida el limite de 72 bytes de bcrypt.
//  - Se bloquean las claves comunes o triviales (lista negra).
//  - No hay rotacion periodica forzada (eso se decide fuera, no aqui).

const crypto = require('crypto');

const LONGITUD_MINIMA = 12;
// bcrypt solo considera los primeros 72 bytes; 64 queda holgado y cubre NIST.
const LONGITUD_MAXIMA = 64;

// Lista negra breve de claves comunes y patrones triviales. En produccion se
// puede ampliar con una lista de credenciales filtradas (p. ej. k-anonimato de
// HaveIBeenPwned), pero una lista local ya corta los casos mas obvios.
const CLAVES_COMUNES = new Set([
  'password', 'password1', 'contrasena', 'contraseña', '123456', '12345678',
  '123456789', '1234567890', 'qwerty', 'qwertyuiop', 'admin', 'administrador',
  'bienvenido', 'welcome', 'iloveyou', 'abc123', 'password123', 'demo', 'demo123',
  'cambiar', 'cambiame', 'secret', 'letmein', 'master', 'root', 'usuario',
]);

// Bases comunes que no deben aparecer NI como parte de la clave. Asi tambien se
// rechazan variantes como 'password1234' o 'admin2026'.
const SUBCADENAS_PROHIBIDAS = [
  'password', 'contrasena', 'contraseña', 'qwerty', '123456', 'iloveyou',
  'welcome', 'letmein', 'abc123', 'admin', 'bienvenido',
];

function esTrivial(clave) {
  const minus = clave.toLowerCase();
  if (CLAVES_COMUNES.has(minus)) return true;
  // Un solo caracter repetido, por ejemplo 'aaaaaaaaaaaa'.
  if (/^(.)\1+$/.test(clave)) return true;
  // Contiene una base comun en cualquier parte.
  if (SUBCADENAS_PROHIBIDAS.some((s) => minus.includes(s))) return true;
  return false;
}

// Valida una clave NUEVA contra la politica. Devuelve { ok, errores }.
function validarPoliticaClave(clave) {
  const errores = [];
  if (typeof clave !== 'string') {
    return { ok: false, errores: ['La clave debe ser texto.'] };
  }
  if (clave.length < LONGITUD_MINIMA) {
    errores.push(`La clave debe tener al menos ${LONGITUD_MINIMA} caracteres.`);
  }
  if (clave.length > LONGITUD_MAXIMA) {
    errores.push(`La clave no puede superar ${LONGITUD_MAXIMA} caracteres.`);
  }
  if (esTrivial(clave)) {
    errores.push('La clave es demasiado comun o trivial. Elija otra.');
  }
  return { ok: errores.length === 0, errores };
}

// Genera una clave temporal aleatoria y legible (base64url de bytes aleatorios).
// Cumple la politica por construccion: 16 caracteres, no trivial. La usa el
// administrador al crear o restablecer una cuenta; el usuario la cambia al entrar.
function generarClaveTemporal() {
  // Regenera en el caso improbable de que caiga una base comun como subcadena.
  for (let intento = 0; intento < 10; intento += 1) {
    const clave = crypto.randomBytes(12).toString('base64url'); // 16 caracteres
    if (validarPoliticaClave(clave).ok) return clave;
  }
  // Respaldo determinista que cumple la politica.
  return `Tmp-${crypto.randomBytes(9).toString('base64url')}`;
}

module.exports = {
  validarPoliticaClave,
  generarClaveTemporal,
  LONGITUD_MINIMA,
  LONGITUD_MAXIMA,
};
