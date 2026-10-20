// Logica pura de encuestas. Sin acceso a base.
const { semanaISO } = require('../utils/fechas');

// Verdadero si se puede responder la encuesta semanal.
// Falso si la ultima encuesta es de la MISMA semana ISO que ahora.
// Verdadero si es de una semana anterior o si no hay encuesta previa.
function sePuedeEncuestaSemanal(ultimaISO, ahoraISO) {
  if (!ultimaISO) return true;
  const ultima = semanaISO(ultimaISO);
  const ahora = semanaISO(ahoraISO);
  return !(ultima.anio === ahora.anio && ultima.semana === ahora.semana);
}

module.exports = { sePuedeEncuestaSemanal };
