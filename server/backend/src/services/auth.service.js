// Lógica de autenticación. Inyección de dependencias para poder probar sin base.
// Mismo resultado (null) ante usuario inexistente o clave errónea: no se filtra cuál falló.

async function login(deps, username, clave) {
  const encontrado = await deps.buscarPorUsername(username);
  if (!encontrado) return null;

  const claveOk = await deps.verificarClave(encontrado.password_hash, clave);
  if (!claveOk) return null;

  // El token lleva solo id y rol: mínimo de PII, nada de full_name ni username.
  const token = deps.firmar({ id: encontrado.id, rol: encontrado.role_name });

  const usuario = {
    id: encontrado.id,
    username: encontrado.username,
    full_name: encontrado.full_name,
    rol: encontrado.role_name,
  };

  return { token, usuario };
}

module.exports = { login };
