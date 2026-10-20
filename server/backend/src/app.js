const express = require('express');
const cors = require('cors');
const routes = require('./routes/index');
const ingestaRoutes = require('./routes/ingesta.routes');
const errorMiddleware = require('./middlewares/error.middleware');

const app = express();
app.use(cors());
app.use(express.json());
app.use('/api', routes);
// Ingesta de sensores: router propio, autenticado por token (no por sesion JWT).
app.use('/api/ingesta', ingestaRoutes);
app.use(errorMiddleware);

module.exports = app;
