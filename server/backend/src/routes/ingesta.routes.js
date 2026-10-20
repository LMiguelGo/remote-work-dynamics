// Router de la ingesta de sensores. Se monta aparte del router de la API de
// usuarios porque no usa sesion JWT: lo autentica un token compartido.
// Cadena: exigeTokenIngesta -> exigeJson -> validarCon(validarLecturaIngesta) -> controlador.
// Ruta efectiva (montada en /api/ingesta): POST /api/ingesta/esp32

const express = require('express');
const { exigeTokenIngesta } = require('../middlewares/ingesta.middleware');
const { exigeJson, validarCon } = require('../middlewares/validacion.middleware');
const { validarLecturaIngesta } = require('../utils/validacion');
const ingestController = require('../controllers/ingest.controller');

const router = express.Router();

router.post(
  '/esp32',
  [exigeTokenIngesta, exigeJson, validarCon(validarLecturaIngesta)],
  async (req, res, next) => {
    try {
      await ingestController.ingestarEsp32(req, res);
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
