const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const config = require('./config/index');
const routes = require('./routes/index');
const ingestaRoutes = require('./routes/ingesta.routes');
const errorMiddleware = require('./middlewares/error.middleware');

const app = express();
// Delante del backend hay un unico proxy, Nginx Proxy Manager, asi que se confia
// en el primer salto para que el rate limiting vea la IP real del cliente por la
// cabecera X-Forwarded-For. Si mas adelante se agrega otro proxy o un balanceador
// por delante, hay que subir este numero para que cuente la IP real del cliente y
// no la del proxy.
app.set('trust proxy', 1);
// Cabeceras de seguridad HTTP (OWASP Secure Headers). Antes de las rutas.
app.use(helmet());
// CORS restringido al origen del frontend, no abierto a todos.
app.use(cors({ origin: config.CORS_ORIGIN.split(',').map((s) => s.trim()) }));
app.use(express.json({ verify: (req, res, buf) => { req.rawBody = buf; } }));
app.use('/api', routes);
// Ingesta de sensores: router propio, autenticado por token (no por sesion JWT).
app.use('/api/ingesta', ingestaRoutes);
app.use(errorMiddleware);

module.exports = app;
