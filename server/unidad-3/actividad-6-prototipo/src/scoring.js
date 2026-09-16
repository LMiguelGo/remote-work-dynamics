// Motor de puntaje compuesto SPACE.

const { PERIODO, DIMENSIONES, REFERENCIAS, ARQUETIPO_DIMENSION } = require('./config');

// Se acota a [1, 100] para que un cero no anule la media geometrica.
function normaliza(valor, min, max) {
  if (max === min) return 1;
  const v = (100 * (valor - min)) / (max - min);
  return Math.max(1, Math.min(100, v));
}

// Para metricas donde menos es mejor, como el lead time.
function normalizaInverso(valor, mejor, peor) {
  const v = (100 * (peor - valor)) / (peor - mejor);
  return Math.max(1, Math.min(100, v));
}

// exp( sum(w_i * ln(x_i)) / sum(w_i) ). Penaliza la dimension mas floja.
function mediaGeometricaPonderada(valores, pesos) {
  let acc = 0;
  let sumaPesos = 0;
  for (const d of DIMENSIONES) {
    const v = Math.max(1, Math.min(100, valores[d]));
    const w = pesos[d] != null ? pesos[d] : 0;
    acc += w * Math.log(v);
    sumaPesos += w;
  }
  if (sumaPesos === 0) return 0;
  return Math.exp(acc / sumaPesos);
}

function pesosDe(db, clienteId, rol) {
  const filas = db
    .prepare('SELECT dimension, peso FROM pesos WHERE cliente_id = ? AND rol = ?')
    .all(clienteId, rol);
  const pesos = {};
  for (const f of filas) pesos[f.dimension] = f.peso;
  for (const d of DIMENSIONES) if (pesos[d] == null) pesos[d] = 1 / DIMENSIONES.length;
  return pesos;
}

function senalesCrudas(db, usuarioId, periodo) {
  const commits = db
    .prepare("SELECT ref FROM eventos WHERE usuario_id = ? AND tipo = 'commit'")
    .all(usuarioId);
  const commitsConDespliegue = new Set(
    db
      .prepare('SELECT commit_ref FROM despliegues WHERE usuario_id = ? AND ok = 1')
      .all(usuarioId)
      .map((r) => r.commit_ref)
  );
  const commitsTotal = commits.length;
  const commitsVerificados = commits.filter((c) => commitsConDespliegue.has(c.ref)).length;

  const tickets = db
    .prepare("SELECT meta FROM eventos WHERE usuario_id = ? AND tipo = 'ticket'")
    .all(usuarioId)
    .map((r) => JSON.parse(r.meta || '{}'));
  const ticketsHechos = tickets.filter((t) => t.estado === 'done');
  const ticketsReabiertos = tickets.filter((t) => t.reabierto).length;
  const leadPromedio =
    ticketsHechos.length > 0
      ? ticketsHechos.reduce((s, t) => s + (t.lead_time_h || REFERENCIAS.lead_max_h), 0) /
        ticketsHechos.length
      : REFERENCIAS.lead_max_h;

  const revisionesValidas = db
    .prepare(
      'SELECT COUNT(*) n, COALESCE(SUM(comentarios),0) c FROM revisiones_pr WHERE revisor_id = ? AND autor_id <> revisor_id'
    )
    .get(usuarioId);
  const autoaprobaciones = db
    .prepare(
      'SELECT COUNT(*) n FROM revisiones_pr WHERE autor_id = ? AND revisor_id = ? AND aprobado = 1'
    )
    .get(usuarioId, usuarioId).n;

  const enc = db
    .prepare('SELECT satisfaccion FROM encuestas WHERE usuario_id = ? AND periodo = ?')
    .get(usuarioId, periodo);
  const satisfaccion = enc ? enc.satisfaccion : 50;

  return {
    commitsTotal,
    commitsVerificados,
    ticketsHechos: ticketsHechos.length,
    storyPoints: ticketsHechos.reduce((s, t) => s + (t.story_points || 0), 0),
    ticketsReabiertos,
    leadPromedio,
    revisiones: revisionesValidas.n,
    comentarios: revisionesValidas.c,
    autoaprobaciones,
    satisfaccion,
  };
}

function contextoDe(db, usuarioId) {
  const filas = db
    .prepare(
      'SELECT metrica, AVG(valor) valor FROM contexto WHERE usuario_id = ? GROUP BY metrica'
    )
    .all(usuarioId);
  const ctx = {};
  for (const f of filas) ctx[f.metrica] = Math.round(f.valor * 10) / 10;
  return ctx;
}

function calcularPuntajeUsuario(db, usuario, periodo = PERIODO) {
  const s = senalesCrudas(db, usuario.id, periodo);

  const dimensiones = {
    S: Math.max(1, Math.min(100, s.satisfaccion)),
    P: (() => {
      const tasaDespliegue = s.commitsTotal > 0 ? s.commitsVerificados / s.commitsTotal : 0;
      const penalizacion = Math.min(30, s.ticketsReabiertos * 10);
      return Math.max(1, Math.min(100, tasaDespliegue * 100 - penalizacion));
    })(),
    A: normaliza(s.commitsVerificados + s.ticketsHechos, 0, REFERENCIAS.A_max),
    C: normaliza(s.revisiones + s.comentarios, 0, REFERENCIAS.C_max),
    E: normalizaInverso(s.leadPromedio, REFERENCIAS.lead_min_h, REFERENCIAS.lead_max_h),
  };

  const pesos = pesosDe(db, usuario.cliente_id, usuario.rol);
  const compuesto = mediaGeometricaPonderada(dimensiones, pesos);

  // Preguntas para el lider, nunca sanciones automaticas.
  const banderas = [];
  const commitsInflados = s.commitsTotal - s.commitsVerificados;
  if (commitsInflados >= 5) {
    banderas.push(
      `Tiene ${commitsInflados} commits que no llegaron a un despliegue real. Conviene revisar con la persona si aportan valor.`
    );
  }
  if (s.autoaprobaciones > 0) {
    banderas.push(
      `Registra ${s.autoaprobaciones} intento(s) de aprobar su propio PR. La revisión cruzada no se cumplió.`
    );
  }
  const dimTop = DIMENSIONES.reduce((a, b) => (dimensiones[a] >= dimensiones[b] ? a : b));
  const esperada = ARQUETIPO_DIMENSION[usuario.arquetipo];
  if (esperada && dimTop !== esperada && dimensiones[dimTop] - dimensiones[esperada] > 25) {
    banderas.push(
      `Su actividad real destaca en ${dimTop} y no en ${esperada}, que es lo esperado para el rol declarado (${usuario.arquetipo}). Puede ser un desajuste de rol.`
    );
  }

  const cobertura = DIMENSIONES.filter((d) => dimensiones[d] > 1).length;

  return {
    usuario: { id: usuario.id, nombre: usuario.nombre, rol: usuario.rol, arquetipo: usuario.arquetipo },
    periodo,
    compuesto: Math.round(compuesto * 10) / 10,
    dimensiones: Object.fromEntries(DIMENSIONES.map((d) => [d, Math.round(dimensiones[d] * 10) / 10])),
    pesos,
    banderas,
    cobertura,
    contexto: contextoDe(db, usuario.id),
    senales: s,
  };
}

// La metrica del lider es la agregacion del desempeno de su equipo, no su actividad individual.
function calcularEquipo(db, lider, periodo = PERIODO) {
  const integrantes = db
    .prepare("SELECT * FROM usuarios WHERE lider_id = ? AND rol = 'empleado'")
    .all(lider.id)
    .map((u) => calcularPuntajeUsuario(db, u, periodo));

  const agregadoDim = {};
  for (const d of DIMENSIONES) {
    agregadoDim[d] = integrantes.length
      ? Math.round(
          (integrantes.reduce((s, i) => s + i.dimensiones[d], 0) / integrantes.length) * 10
        ) / 10
      : 0;
  }
  const metricaLider = integrantes.length
    ? Math.round((integrantes.reduce((s, i) => s + i.compuesto, 0) / integrantes.length) * 10) / 10
    : 0;

  const banderas = integrantes
    .filter((i) => i.banderas.length)
    .map((i) => ({ integrante: i.usuario.nombre, preguntas: i.banderas }));

  return {
    lider: { id: lider.id, nombre: lider.nombre },
    periodo,
    integrantes,
    agregadoDimensiones: agregadoDim,
    metricaLider,
    preguntasParaElLider: banderas,
  };
}

function calcularOrganizacion(db, gerente, periodo = PERIODO) {
  const lideres = db
    .prepare("SELECT * FROM usuarios WHERE lider_id = ? AND rol = 'lider'")
    .all(gerente.id);
  const equipos = lideres.map((l) => {
    const e = calcularEquipo(db, l, periodo);
    return {
      lider: e.lider,
      metricaLider: e.metricaLider,
      agregadoDimensiones: e.agregadoDimensiones,
      tamano: e.integrantes.length,
      preguntasAbiertas: e.preguntasParaElLider.length,
    };
  });
  const metricaOrg = equipos.length
    ? Math.round((equipos.reduce((s, e) => s + e.metricaLider, 0) / equipos.length) * 10) / 10
    : 0;
  return { gerente: { id: gerente.id, nombre: gerente.nombre }, periodo, equipos, metricaOrganizacion: metricaOrg };
}

module.exports = {
  calcularPuntajeUsuario,
  calcularEquipo,
  calcularOrganizacion,
  mediaGeometricaPonderada,
  normaliza,
};
