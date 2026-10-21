const crypto = require('crypto');
const config = require('../config/index');

function exigeFirmaGithub(req, res, next) {
  const recibida = req.headers['x-hub-signature-256'];
  if (!recibida || !req.rawBody) return res.status(401).json({ error: 'Firma ausente' });
  const esperada = 'sha256=' +
    crypto.createHmac('sha256', config.GITHUB_WEBHOOK_SECRET).update(req.rawBody).digest('hex');
  const a = Buffer.from(recibida), b = Buffer.from(esperada);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(401).json({ error: 'Firma invalida' });
  }
  next();
}
module.exports = { exigeFirmaGithub };
