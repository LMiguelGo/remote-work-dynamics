const { pool } = require('../db/pool');
const dataSources = require('../repositories/dataSources.repo');
const events = require('../repositories/events.repo');
const {
  construirEstadoDispositivos,
  construirConectividad,
  UMBRAL_EN_VIVO_SEGUNDOS,
} = require('../services/operacion.service');

// Configuracion de operacion del gerente. El diagrama fijo del modelo NO tiene
// tabla para esto, asi que se sirve desde valores por defecto EN MEMORIA y su
// persistencia queda diferida: un PUT la cambia solo mientras el proceso vive y
// se reinicia al reiniciar el contenedor. No se agregan tablas al esquema.
const configPorDefecto = {
  umbral_en_vivo_segundos: UMBRAL_EN_VIVO_SEGUNDOS, // ventana para marcar "en vivo"
  ventana_retencion_dias: 30, // retencion visible de eventos en el panel
};
let configActual = { ...configPorDefecto };

// Claves aceptadas por PUT y su validacion (enteros positivos).
const CLAVES_CONFIG = ['umbral_en_vivo_segundos', 'ventana_retencion_dias'];

// GET /operacion/dispositivos -> estado de todas las fuentes y su dueno.
async function dispositivos(req, res) {
  const fuentes = await dataSources.estadoDeFuentes(pool);
  const respuesta = construirEstadoDispositivos(
    fuentes,
    new Date(),
    configActual.umbral_en_vivo_segundos
  );
  return res.json(respuesta);
}

// GET /operacion/conectividad -> QoS e interrupciones por fuente network.
async function conectividad(req, res) {
  const eventosRed = await events.ultimaRedPorFuente(pool);
  const respuesta = construirConectividad(eventosRed);
  return res.json(respuesta);
}

// GET /operacion/config -> configuracion actual (en memoria).
async function obtenerConfig(req, res) {
  return res.json({ config: configActual, persistencia: 'en memoria' });
}

// PUT /operacion/config -> actualiza en memoria las claves conocidas.
async function actualizarConfig(req, res) {
  const cambios = {};
  const errores = [];
  for (const clave of CLAVES_CONFIG) {
    if (req.body && req.body[clave] !== undefined) {
      const valor = Number(req.body[clave]);
      if (!Number.isInteger(valor) || valor <= 0) {
        errores.push(`${clave} debe ser un entero positivo`);
      } else {
        cambios[clave] = valor;
      }
    }
  }
  if (errores.length > 0) {
    return res.status(400).json({ error: 'Configuracion invalida', detalles: errores });
  }
  configActual = { ...configActual, ...cambios };
  return res.json({ ok: true, config: configActual, persistencia: 'en memoria' });
}

module.exports = {
  dispositivos,
  conectividad,
  obtenerConfig,
  actualizarConfig,
};
