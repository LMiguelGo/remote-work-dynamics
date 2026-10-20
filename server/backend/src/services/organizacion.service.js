// Servicio PURO que arma la forma JSON de la organizacion para el gerente.
// Reutiliza construirEquipo para que cada equipo tenga el mismo resumen por
// dimension. No calcula puntajes; solo agrupa y da forma. Nunca lanza.

const { construirEquipo } = require('./equipo.service');

// construirOrganizacion(gerente, equipos, analiticas) -> respuesta
//   equipos: [{ lider, integrantes }]
//   analiticas: filas planas de analyses.repo para todos los integrantes.
function construirOrganizacion(gerente, equipos, analiticas) {
  const equiposSalida = (equipos || []).map((eq) =>
    construirEquipo(eq.lider, eq.integrantes, analiticas)
  );

  return {
    gerente: gerente
      ? { id: gerente.id, username: gerente.username, full_name: gerente.full_name }
      : null,
    equipos: equiposSalida,
  };
}

module.exports = { construirOrganizacion };
