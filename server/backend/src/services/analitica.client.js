// Cliente de solo lectura del contenedor de analitica. El backend no calcula puntajes ni correlaciones: las pide aqui.
// Lee `config.ANALYTICS_URL` en cada llamada para poder apuntarlo a un servidor de prueba.
const config = require('../config/index');

async function pedir(ruta, { method = 'GET', cuerpo } = {}) {
  const ctrl = new AbortController();
  const temporizador = setTimeout(() => ctrl.abort(), config.ANALYTICS_TIMEOUT_MS);
  try {
    const r = await fetch(config.ANALYTICS_URL + ruta, {
      method,
      signal: ctrl.signal,
      headers: { accept: 'application/json', ...(cuerpo ? { 'content-type': 'application/json' } : {}) },
      body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    });
    if (!r.ok) {
      const err = new Error(`La analitica respondio ${r.status} en ${ruta}`);
      err.status = r.status;
      try {
        err.detalle = (await r.json()).detail;
      } catch {
        // sin cuerpo JSON
      }
      throw err;
    }
    return await r.json();
  } finally {
    clearTimeout(temporizador);
  }
}

// Cada cuanto recalcula la analitica el dia en curso y las relaciones (1440 = solo el cierre de las 00:00). Lo configura el
// administrador. Estas dos funciones lanzan si analitica no responde: quien llama decide que mostrar.
async function verRecalculo() {
  return pedir('/config/recalculo');
}

async function cambiarRecalculo(intervaloMinutos) {
  return pedir('/config/recalculo', { method: 'PUT', cuerpo: { intervalo_minutos: intervaloMinutos } });
}

// Catalogo de las 28 metricas (nombre, unidad, direccion, escala y franjas). Cambia solo al desplegar analitica, asi que se
// guarda en memoria y se vuelve a pedir al vencer el plazo. Si analitica no responde se sigue usando el ultimo que se tuvo,
// aunque haya vencido; sin ninguno devuelve null.
let cacheCatalogo = null; // { datos, vence }
async function catalogo() {
  if (cacheCatalogo && Date.now() < cacheCatalogo.vence) return cacheCatalogo.datos;
  try {
    const datos = await pedir('/metricas/catalogo');
    cacheCatalogo = { datos, vence: Date.now() + config.ANALYTICS_CATALOGO_TTL_MS };
    return datos;
  } catch (err) {
    console.error('No se pudo leer el catalogo de la analitica:', err.message);
    return cacheCatalogo ? cacheCatalogo.datos : null;
  }
}

// Correlaciones de una persona, entre metricas y entre dimensiones. Son un complemento: si analitica no responde devuelve
// null y el resto del detalle se entrega igual.
async function correlaciones(usuarioId) {
  const q = `?usuario_id=${encodeURIComponent(usuarioId)}`;
  try {
    const [metricas, dimensiones] = await Promise.all([
      pedir('/correlaciones/metricas' + q),
      pedir('/correlaciones/dimensiones' + q),
    ]);
    return {
      calculado_en: metricas.calculado_en,
      metricas: metricas.correlaciones,
      dimensiones: dimensiones.correlaciones,
    };
  } catch (err) {
    console.error('No se pudieron leer las correlaciones de la analitica:', err.message);
    return null;
  }
}

// Solo para pruebas: olvida el catalogo guardado.
function olvidarCatalogo() {
  cacheCatalogo = null;
}

module.exports = { catalogo, correlaciones, olvidarCatalogo, verRecalculo, cambiarRecalculo };
