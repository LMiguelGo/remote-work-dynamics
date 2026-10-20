const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const config = require('./config/index');
const routes = require('./routes/index');
const ingestaRoutes = require('./routes/ingesta.routes');
const errorMiddleware = require('./middlewares/error.middleware');

const app = express();
// Detras del nginx del frontend hay un proxy, asi que confiamos en el primer
// salto para que el rate limiting vea la IP real del cliente (X-Forwarded-For).
// Para la demo basta 1 salto; no es critico.
app.set('trust proxy', 1);
// Cabeceras de seguridad HTTP (OWASP Secure Headers). Antes de las rutas.
app.use(helmet());
// CORS restringido al origen del frontend, no abierto a todos.
app.use(cors({ origin: config.CORS_ORIGIN.split(',').map((s) => s.trim()) }));
app.use(express.json());
app.use('/api', routes);
// Ingesta de sensores: router propio, autenticado por token (no por sesion JWT).
app.use('/api/ingesta', ingestaRoutes);
app.use(errorMiddleware);

module.exports = app;
