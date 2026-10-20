// eslint-disable-next-line no-unused-vars
function errorMiddleware(err, req, res, next) {
  console.error('Error:', err.message);
  const status = err.status || 500;
  res.status(status).json({ error: err.message || 'Error interno del servidor' });
}

module.exports = errorMiddleware;
