async function construirSalud(deps) {
  let base = 'conectada';
  let estado = 'ok';
  let usuarios = 0;
  let conectores = [];

  try {
    usuarios = await deps.contarUsuarios();
    if (!(usuarios > 0)) estado = 'degradado';
  } catch (err) {
    base = 'sin datos';
    estado = 'degradado';
    usuarios = 0;
  }

  try {
    conectores = await deps.ultimasIngestas();
  } catch (err) {
    conectores = [];
  }

  return { estado, base, usuarios, conectores, ts: new Date().toISOString() };
}

module.exports = { construirSalud };
