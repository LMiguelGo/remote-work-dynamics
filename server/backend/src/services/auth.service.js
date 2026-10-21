// Logica de autenticacion. Inyeccion de dependencias para poder probar sin base.
// Mismo resultado (null) ante usuario inexistente, inactivo o clave erronea: no se
// filtra cual fallo (OWASP: evitar enumeracion de cuentas).

const { validarPoliticaClave } = require('../utils/password');

async function login(deps, username, clave) {
  const encontrado = await deps.buscarPorUsername(username);
  if (!encontrado) return null;
  // Una cuenta desactivada no entra, con el mismo error generico.
  if (encontrado.is_active === false) return null;

  const claveOk = await deps.verificarClave(encontrado.password_hash, clave);
  if (!claveOk) return null;

  // El token lleva id, rol y el indicador de cambio obligatorio (mc). Nada de PII:
  // ni full_name ni username. mc permite exigir el cambio en el servidor sin
  // consultar la base en cada peticion.
  const token = deps.firmar({
    id: encontrado.id,
    rol: encontrado.role_name,
    mc: encontrado.must_change_password === true,
  });

  const usuario = {
    id: encontrado.id,
    username: encontrado.username,
    full_name: encontrado.full_name,
    rol: encontrado.role_name,
  };

  return { token, usuario, debe_cambiar_clave: encontrado.must_change_password === true };
}

// Cambia la clave del usuario en sesion. Verifica la clave actual, valida la nueva
// contra la politica, la guarda y emite un token nuevo con mc en false.
// deps = { obtenerPorId(id), verificarClave(hash, clave), hash(clave),
//          actualizarClave({userId, passwordHash, mustChange}), firmar(payload) }
// Devuelve { ok:true, token } o { ok:false, codigo, errores? }.
//   codigo: 'no_encontrado' | 'clave_actual_invalida' | 'politica'
async function cambiarClave(deps, { userId, claveActual, claveNueva }) {
  const usuario = await deps.obtenerPorId(userId);
  if (!usuario) return { ok: false, codigo: 'no_encontrado' };

  const actualOk = await deps.verificarClave(usuario.password_hash, claveActual);
  if (!actualOk) return { ok: false, codigo: 'clave_actual_invalida' };

  const politica = validarPoliticaClave(claveNueva);
  if (!politica.ok) return { ok: false, codigo: 'politica', errores: politica.errores };

  const passwordHash = await deps.hash(claveNueva);
  await deps.actualizarClave({ userId, passwordHash, mustChange: false });

  const token = deps.firmar({ id: usuario.id, rol: usuario.role_name, mc: false });
  return { ok: true, token };
}

module.exports = { login, cambiarClave };
