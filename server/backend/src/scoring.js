// Motor de puntaje compuesto SPACE.

const { PERIODO, DIMENSIONES, REFERENCIAS, ARQUETIPO_DIMENSION, HORAS_PACTADAS } = require('./config');

// Cada item de la microencuesta va en escala de 1 a 5. eNPS y flujo suman cuando son altos;
// la fatiga se invierte, porque mas fatiga es peor. El resultado queda de 0 a 100.
function satisfaccionDeEncuestas(filas) {
  if (!filas.length) return 50;
  const aCien = (v) => ((v - 1) / 4) * 100;
  const porDia = filas.map((f) => (aCien(f.enps) + aCien(f.flujo) + aCien(6 - f.fatiga)) / 3);
  return porDia.reduce((s, v) => s + v, 0) / porDia.length;
}

// Sobretiempo del periodo frente a la jornada pactada. Es contexto de bienestar, nunca puntua.
function tiempoExtralaboral(db, usuario, periodo) {
  const cerradas = db
    .prepare("SELECT inicio, fin FROM jornadas WHERE usuario_id = ? AND fin IS NOT NULL AND substr(inicio,1,7) = ?")
    .all(usuario.id, periodo);
  if (!cerradas.length) return null;
  const pactadas = usuario.horas_pactadas || HORAS_PACTADAS;
  const horasReales = cerradas.reduce((s, j) => s + (new Date(j.fin) - new Date(j.inicio)) / 3.6e6, 0);
  const horasPactadas = cerradas.length * pactadas;
  if (horasPactadas <= 0) return null;
  return Math.round(((horasReales - horasPactadas) / horasPactadas) * 1000) / 10;
}

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

  const encuestas = db
    .prepare("SELECT enps, fatiga, flujo FROM encuestas_diarias WHERE usuario_id = ? AND substr(fecha,1,7) = ?")
    .all(usuarioId, periodo);
  const satisfaccion = satisfaccionDeEncuestas(encuestas);

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
    respuestasEncuesta: encuestas.length,
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

  const contexto = contextoDe(db, usuario.id);
  contexto.extralaboral_pct = tiempoExtralaboral(db, usuario, periodo);

  return {
    usuario: { id: usuario.id, nombre: usuario.nombre, rol: usuario.rol, arquetipo: usuario.arquetipo },
    periodo,
    compuesto: Math.round(compuesto * 10) / 10,
    dimensiones: Object.fromEntries(DIMENSIONES.map((d) => [d, Math.round(dimensiones[d] * 10) / 10])),
    pesos,
    banderas,
    cobertura,
    contexto,
    senales: s,
  };
}

// Promedio diario del animo del equipo, para el grafico temporal de doble eje.
// Sale de las microencuestas del periodo, agrupadas por fecha.
function serieAnimoEquipo(db, lider, periodo = PERIODO) {
  return db
    .prepare(
      "SELECT e.fecha, AVG(e.enps) enps, AVG(e.fatiga) fatiga, AVG(e.flujo) flujo " +
        'FROM encuestas_diarias e JOIN usuarios u ON u.id = e.usuario_id ' +
        "WHERE u.lider_id = ? AND u.rol = 'empleado' AND substr(e.fecha,1,7) = ? " +
        'GROUP BY e.fecha ORDER BY e.fecha'
    )
    .all(lider.id, periodo)
    .map((r) => ({
      fecha: r.fecha,
      enps: Math.round(r.enps * 100) / 100,
      fatiga: Math.round(r.fatiga * 100) / 100,
      flujo: Math.round(r.flujo * 100) / 100,
    }));
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
    serieAnimo: serieAnimoEquipo(db, lider, periodo),
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
  tiempoExtralaboral,
};
