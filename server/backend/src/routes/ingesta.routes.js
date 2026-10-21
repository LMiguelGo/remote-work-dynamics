// Router de la ingesta de sensores. Se monta aparte del router de la API de
// usuarios porque no usa sesion JWT: lo autentica un token compartido.
// Cadena: exigeTokenIngesta -> exigeJson -> validarCon(validarLecturaIngesta) -> controlador.
// Ruta efectiva (montada en /api/ingesta): POST /api/ingesta/esp32

const express = require('express');
const { exigeTokenIngesta } = require('../middlewares/ingesta.middleware');
const { exigeJson, validarCon } = require('../middlewares/validacion.middleware');
const { validarLecturaIngesta, validarEventoIngesta } = require('../utils/validacion');
const { crearLimitador } = require('../middlewares/rateLimit.middleware');
const ingestController = require('../controllers/ingest.controller');

const router = express.Router();

// Limite mas holgado que el del login (OWASP API4: Unrestricted Resource
// Consumption): 60 lecturas por minuto por IP. Acota abuso sin ahogar el envio
// periodico normal del ESP32.
const limitadorIngesta = crearLimitador({
  windowMs: 60 * 1000,
  max: 60,
  mensaje: 'Demasiadas lecturas en poco tiempo. Reduzca la frecuencia de envio.',
});

router.post(
  '/esp32',
  [limitadorIngesta, exigeTokenIngesta, exigeJson, validarCon(validarLecturaIngesta)],
  async (req, res, next) => {
    try {
      await ingestController.ingestarEsp32(req, res);
    } catch (err) {
      next(err);
    }
  }
);

// Ingesta generica por contrato (montada en /api/ingesta -> POST /api/ingesta).
// La usan los conectores que ya hablan el contrato del equipo, como el de Jira.
// Misma cadena de seguridad que /esp32: limite, token, json y validacion.
router.post(
  '/',
  [limitadorIngesta, exigeTokenIngesta, exigeJson, validarCon(validarEventoIngesta)],
  async (req, res, next) => {
    try {
      await ingestController.ingestarEvento(req, res);
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
