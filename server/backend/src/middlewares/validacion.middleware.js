// Middlewares de validacion de entrada (defensa en el servidor, OWASP).

// Exige que el cuerpo venga como application/json. Responde 415 si no.
function exigeJson(req, res, next) {
  const tipo = (req.headers && req.headers['content-type']) || '';
  if (!tipo.toLowerCase().includes('application/json')) {
    return res.status(415).json({ error: 'Content-Type debe ser application/json' });
  }
  return next();
}

// Corre un validador puro sobre req.body. 400 con { errores } si no pasa; next() si pasa.
function validarCon(fn) {
  return function (req, res, next) {
    const { ok, errores } = fn(req.body);
    if (!ok) {
      return res.status(400).json({ errores });
    }
    return next();
  };
}

module.exports = { exigeJson, validarCon };
