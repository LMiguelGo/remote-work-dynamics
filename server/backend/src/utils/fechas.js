// Utilidades de fecha puras, sin dependencias ni acceso a base.

// Diferencia en horas entre dos instantes ISO 8601.
function horasEntre(inicioISO, finISO) {
  const inicio = new Date(inicioISO).getTime();
  const fin = new Date(finISO).getTime();
  return (fin - inicio) / 3600000;
}

// Clave de semana ISO 8601 (ano + numero de semana) de una fecha.
// La semana empieza en lunes y la semana 1 es la que contiene el primer jueves.
function semanaISO(fecha) {
  const d = new Date(fecha);
  const base = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const diaLunes0 = (base.getUTCDay() + 6) % 7; // lunes = 0 ... domingo = 6
  // Se mueve al jueves de la misma semana ISO.
  base.setUTCDate(base.getUTCDate() - diaLunes0 + 3);
  const anio = base.getUTCFullYear();
  const primerJueves = new Date(Date.UTC(anio, 0, 4));
  const diaPrimero0 = (primerJueves.getUTCDay() + 6) % 7;
  primerJueves.setUTCDate(primerJueves.getUTCDate() - diaPrimero0 + 3);
  const semana = 1 + Math.round((base.getTime() - primerJueves.getTime()) / (7 * 86400000));
  return { anio, semana };
}

// Verdadero si dos instantes caen en el mismo dia UTC.
function mismoDiaUTC(a, b) {
  const da = new Date(a);
  const db = new Date(b);
  return (
    da.getUTCFullYear() === db.getUTCFullYear() &&
    da.getUTCMonth() === db.getUTCMonth() &&
    da.getUTCDate() === db.getUTCDate()
  );
}

module.exports = { horasEntre, semanaISO, mismoDiaUTC };
