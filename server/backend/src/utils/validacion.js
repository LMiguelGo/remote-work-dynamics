// Validadores puros (sin dependencias). Devuelven { ok, errores }.
// Base: OWASP Input Validation Cheat Sheet -> validar en el servidor, lista blanca
// de campos y rangos, rechazar todo lo que no encaje.

// Rangos razonables para los umbrales ambientales del puesto.
const RANGOS_UMBRAL = {
  temperatura_c: { min: -10, max: 60 },
  humedad_pct: { min: 0, max: 100 },
  ruido_db: { min: 0, max: 130 },
};

function esEnteroEnRango(valor, min, max) {
  return typeof valor === 'number' && Number.isInteger(valor) && valor >= min && valor <= max;
}

function esNumeroEnRango(valor, min, max) {
  return typeof valor === 'number' && Number.isFinite(valor) && valor >= min && valor <= max;
}

// Validador suelto de un entero en rango.
function enteroEnRango(valor, min, max) {
  const errores = [];
  if (!esEnteroEnRango(valor, min, max)) {
    errores.push(`Se esperaba un entero entre ${min} y ${max}.`);
  }
  return { ok: errores.length === 0, errores };
}

// Valida que un cuerpo tenga exactamente los campos dados, todos enteros 1-5.
function validarEnterosUno5(body, campos) {
  const errores = [];
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, errores: ['El cuerpo debe ser un objeto JSON.'] };
  }
  for (const campo of campos) {
    if (!(campo in body)) {
      errores.push(`Falta el campo "${campo}".`);
      continue;
    }
    if (!esEnteroEnRango(body[campo], 1, 5)) {
      errores.push(`El campo "${campo}" debe ser un entero entre 1 y 5.`);
    }
  }
  // Lista blanca: rechaza campos no esperados.
  for (const clave of Object.keys(body)) {
    if (!campos.includes(clave)) {
      errores.push(`Campo no permitido: "${clave}".`);
    }
  }
  return { ok: errores.length === 0, errores };
}

function validarEncuestaDiaria(body) {
  return validarEnterosUno5(body, [
    'satisfaction_level',
    'tools_perception',
    'fatigue_level',
    'concentration_perception',
  ]);
}

function validarEncuestaSemanal(body) {
  return validarEnterosUno5(body, [
    'communication_quality',
    'team_coordination',
    'documentation_perception',
  ]);
}

// Finaliza jornada: end_time debe ser una fecha ISO 8601 valida.
function validarJornadaFin(body) {
  const errores = [];
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, errores: ['El cuerpo debe ser un objeto JSON.'] };
  }
  const { end_time } = body;
  if (typeof end_time !== 'string' || end_time.trim() === '') {
    errores.push('end_time es obligatorio.');
  } else if (Number.isNaN(new Date(end_time).getTime())) {
    errores.push('end_time no es una fecha ISO 8601 valida.');
  }
  return { ok: errores.length === 0, errores };
}

// Umbrales ambientales: cada clave con { min, max } numericos, en su rango y con min <= max.
function validarUmbrales(body) {
  const errores = [];
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, errores: ['El cuerpo debe ser un objeto JSON.'] };
  }
  const clavesPermitidas = Object.keys(RANGOS_UMBRAL);
  for (const clave of clavesPermitidas) {
    const par = body[clave];
    if (!par || typeof par !== 'object' || Array.isArray(par)) {
      errores.push(`Falta o es invalido el umbral "${clave}".`);
      continue;
    }
    const rango = RANGOS_UMBRAL[clave];
    if (!esNumeroEnRango(par.min, rango.min, rango.max)) {
      errores.push(`"${clave}.min" debe ser un numero entre ${rango.min} y ${rango.max}.`);
    }
    if (!esNumeroEnRango(par.max, rango.min, rango.max)) {
      errores.push(`"${clave}.max" debe ser un numero entre ${rango.min} y ${rango.max}.`);
    }
    if (
      esNumeroEnRango(par.min, rango.min, rango.max) &&
      esNumeroEnRango(par.max, rango.min, rango.max) &&
      par.min > par.max
    ) {
      errores.push(`En "${clave}" el minimo no puede superar al maximo.`);
    }
  }
  for (const clave of Object.keys(body)) {
    if (!clavesPermitidas.includes(clave)) {
      errores.push(`Umbral no permitido: "${clave}".`);
    }
  }
  return { ok: errores.length === 0, errores };
}

// Lectura cruda del firmware ESP32 para la ingesta (HTTP o MQTT). Exige
// "dispositivo" presente (cadena no vacia) y temperatura/humedad/ruido_raw
// numericos finitos. Lista blanca implicita: no se exige mas, pero los campos
// obligatorios deben venir bien formados.
function validarLecturaIngesta(body) {
  const errores = [];
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, errores: ['El cuerpo debe ser un objeto JSON.'] };
  }
  if (typeof body.dispositivo !== 'string' || body.dispositivo.trim() === '') {
    errores.push('dispositivo es obligatorio.');
  }
  for (const campo of ['temperatura', 'humedad', 'ruido_raw']) {
    if (typeof body[campo] !== 'number' || !Number.isFinite(body[campo])) {
      errores.push(`El campo "${campo}" debe ser numerico.`);
    }
  }
  return { ok: errores.length === 0, errores };
}

module.exports = {
  enteroEnRango,
  validarEncuestaDiaria,
  validarEncuestaSemanal,
  validarJornadaFin,
  validarUmbrales,
  validarLecturaIngesta,
};
