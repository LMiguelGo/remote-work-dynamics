// Tablero. Pide el token al entrar y arma la vista del rol con el mismo lenguaje visual.

const DIMN = {
  S: 'Satisfacción y bienestar',
  P: 'Rendimiento',
  A: 'Actividad',
  C: 'Comunicación y colaboración',
  E: 'Eficiencia y flujo',
};
const ORDEN = ['S', 'P', 'A', 'C', 'E'];

const ICON = {
  thermo:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13.6V5a2 2 0 1 1 4 0v8.6a4 4 0 1 1-4 0Z"/><path d="M12 9v5.2"/></svg>',
  shield:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l7 3v5c0 4.5-3 7.6-7 9-4-1.4-7-4.5-7-9V6l7-3Z"/><path d="M9 12l2 2 4-4"/></svg>',
  wifi:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 8.8a15 15 0 0 1 20 0"/><path d="M5 12.3a10 10 0 0 1 14 0"/><path d="M8.5 15.7a5 5 0 0 1 7 0"/><circle cx="12" cy="19" r="1.1" fill="currentColor" stroke="none"/></svg>',
  lock:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4.5" y="10" width="15" height="10" rx="2.5"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/><circle cx="12" cy="15" r="1.3" fill="currentColor" stroke="none"/></svg>',
  users:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.2"/><path d="M3.5 19a5.5 5.5 0 0 1 11 0"/><path d="M16 5.3a3.2 3.2 0 0 1 0 5.4"/><path d="M18.5 19a5.6 5.6 0 0 0-3-4.9"/></svg>',
  building:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M9 7h2m2 0h2M9 11h2m2 0h2M9 15h2m2 0h2"/></svg>',
  chart:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 20h18"/><rect x="5" y="11" width="3.4" height="7" rx="1"/><rect x="10.3" y="7" width="3.4" height="11" rx="1"/><rect x="15.6" y="13" width="3.4" height="5" rx="1"/></svg>',
  chev:
    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>',
};

let token = null;
let usuario = null;

const $ = (id) => document.getElementById(id);

async function api(ruta, opciones = {}) {
  const headers = Object.assign({ 'Content-Type': 'application/json' }, opciones.headers || {});
  if (token) headers.Authorization = `Bearer ${token}`;
  const r = await fetch(ruta, Object.assign({}, opciones, { headers }));
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Error ${r.status}`);
  return j;
}

function iniciales(nombre) {
  return nombre
    .split(' ')
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase();
}

function ring(value, { size = 108, color = 'var(--blue)', label, sub } = {}) {
  const v = Math.max(0, Math.min(100, value || 0));
  const sw = size >= 100 ? 10 : 8;
  const r = (size - sw) / 2;
  const c = 2 * Math.PI * r;
  const off = c * (1 - v / 100);
  const m = size / 2;
  return `<div class="ring${size < 100 ? ' sm' : ''}" style="width:${size}px;height:${size}px">
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <circle cx="${m}" cy="${m}" r="${r}" fill="none" stroke="#e9edf5" stroke-width="${sw}"/>
      <circle cx="${m}" cy="${m}" r="${r}" fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}"/>
    </svg>
    <div class="mid">${label != null ? `<b>${label}</b>` : ''}${sub ? `<small>${sub}</small>` : ''}</div>
  </div>`;
}

function spark(vals) {
  let v = Array.isArray(vals) ? vals.slice() : [];
  if (v.length < 2) v = v.length ? [v[0], v[0]] : [0, 0];
  const w = 100,
    h = 40,
    pad = 4;
  const min = Math.min(...v),
    max = Math.max(...v),
    span = max - min || 1;
  const pts = v.map((n, i) => [pad + (i * (w - 2 * pad)) / (v.length - 1), h - pad - ((n - min) / span) * (h - 2 * pad)]);
  const line = pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  const area = `${pad},${h - pad} ${line} ${w - pad},${h - pad}`;
  const last = pts[pts.length - 1];
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
    <defs><linearGradient id="sg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="rgba(47,107,237,.2)"/><stop offset="1" stop-color="rgba(47,107,237,0)"/></linearGradient></defs>
    <polygon points="${area}" fill="url(#sg)"/>
    <polyline points="${line}" fill="none" stroke="var(--blue)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>
    <circle cx="${last[0].toFixed(1)}" cy="${last[1].toFixed(1)}" r="2.4" fill="var(--blue)" vector-effect="non-scaling-stroke"/>
  </svg>`;
}

function dimsHTML(dims) {
  return (
    '<div class="dims">' +
    ORDEN.map(
      (d) =>
        `<div class="dim"><span class="lbl">${DIMN[d]}</span><span class="track"><span class="fill" style="width:${dims[d]}%"></span></span><span class="num">${dims[d]}</span></div>`
    ).join('') +
    '</div>'
  );
}

function colorPuntaje(v) {
  if (v >= 75) return 'var(--green)';
  if (v >= 50) return 'var(--blue)';
  return 'var(--amber)';
}

// ---------- Barra superior ----------
function topbar(tabs) {
  const bar = $('topbar');
  bar.hidden = false;
  bar.innerHTML = `<div class="topbar-in">
    <div class="brand"><span class="mark">${ICON.shield}</span> Espacio laboral</div>
    <nav class="nav">${tabs
      .map((t, i) => `<button data-target="${t.target || ''}" class="${i === 0 ? 'active' : ''}">${t.label}</button>`)
      .join('')}</nav>
    <div class="userchip">
      <div class="who"><b>${usuario.nombre}</b><span>${rolTexto(usuario.rol)}</span></div>
      <div class="avatar">${iniciales(usuario.nombre)}</div>
      <button class="logout" id="salir">Salir</button>
    </div>
  </div>`;
  bar.querySelectorAll('.nav button').forEach((b) =>
    b.addEventListener('click', () => {
      bar.querySelectorAll('.nav button').forEach((x) => x.classList.remove('active'));
      b.classList.add('active');
      const t = b.dataset.target;
      if (!t) window.scrollTo({ top: 0, behavior: 'smooth' });
      else document.getElementById(t)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    })
  );
  $('salir').addEventListener('click', salir);
}

function rolTexto(rol) {
  return rol === 'empleado' ? 'Empleado' : rol === 'lider' ? 'Líder de equipo' : 'Gerente';
}

function pagehead(titulo, sub, pill) {
  return `<div class="pagehead">
    <div><h1>${titulo}</h1><p>${sub}</p></div>
    <span class="viewpill"><span class="d"></span> Vista: ${pill}</span>
  </div>`;
}

// ---------- Login ----------
async function renderLogin() {
  $('topbar').hidden = true;
  const app = $('app');
  app.innerHTML = `<div class="login-wrap"><div class="login">
    <div class="mark">${ICON.shield}</div>
    <h1>Espacio laboral</h1>
    <p>Análisis de dinámicas de trabajo remoto. Escoge un usuario para ver qué muestra el sistema según su rol.</p>
    <div class="field"><label>Usuario</label><select id="usuario"></select></div>
    <div class="field"><label>Clave</label><input id="clave" type="password" value="demo123" /></div>
    <button class="btn solid" id="entrar">Entrar</button>
    <p class="error" id="loginError" hidden></p>
    <p class="hint">Clave de la demostración: <code>demo123</code></p>
  </div></div>`;
  try {
    const lista = await api('/api/usuarios-demo');
    $('usuario').innerHTML = lista.map((u) => `<option value="${u.nombre}">${u.nombre} — ${rolTexto(u.rol)}</option>`).join('');
  } catch {
    $('loginError').textContent = '¿Sembraste los datos con npm run seed?';
    $('loginError').hidden = false;
  }
  $('entrar').addEventListener('click', entrar);
  $('clave').addEventListener('keydown', (e) => e.key === 'Enter' && entrar());
}

async function entrar() {
  $('loginError').hidden = true;
  try {
    const r = await api('/api/login', { method: 'POST', body: JSON.stringify({ usuario: $('usuario').value, clave: $('clave').value }) });
    token = r.token;
    usuario = r.usuario;
    if (usuario.rol === 'empleado') await verEmpleado();
    else if (usuario.rol === 'lider') await verLider();
    else await verGerente();
  } catch (e) {
    $('loginError').textContent = e.message;
    $('loginError').hidden = false;
  }
}

function salir() {
  token = null;
  usuario = null;
  renderLogin();
}

// ---------- Vista del empleado ----------
async function verEmpleado() {
  const d = await api('/api/mi-panel');
  topbar([{ label: 'Mi entorno' }, { label: 'Transparencia', target: 'card-transparencia' }]);

  const amb = d.ambiente;
  const con = d.conexion;
  const sinAlertas = d.alertas.length === 0;
  const bienOk = d.bienestar.nivel >= 80;

  const cardAmbiente = `<div class="card" style="--i:0">
    <div class="card-head"><div class="icon-chip">${ICON.thermo}</div>
      <div><h3 class="card-title">Condiciones ambientales</h3></div>
      <div class="card-tag">Espacio físico</div></div>
    <div class="stats">
      <div class="stat"><div class="k">Temperatura</div><div class="v">${amb.temperatura ?? '—'}<small>°C</small></div></div>
      <div class="stat"><div class="k">Humedad</div><div class="v">${amb.humedad ?? '—'}<small>%</small></div></div>
      <div class="stat"><div class="k">Presión</div><div class="v">${amb.presion ?? '—'}<small>hPa</small></div></div>
    </div>
    <div class="section-label">Variación de temperatura reciente</div>
    ${spark(amb.serieTemp)}
    <div class="dotline" style="margin-top:14px"><span class="dot ${amb.estado === 'Normal' ? '' : 'amber'}"></span> Estado ambiental: ${amb.estado}</div>
    <div class="card-foot">Fuente: BME280</div>
  </div>`;

  const cardAlertas = `<div class="card" style="--i:1">
    <div class="card-head"><div class="icon-chip green">${ICON.shield}</div>
      <div><h3 class="card-title">Alertas preventivas</h3><div class="card-sub">Bienestar</div></div>
      <div class="card-tag">Bienestar</div></div>
    <div class="big">${sinAlertas ? 'Sin alertas activas' : `${d.alertas.length} alerta${d.alertas.length > 1 ? 's' : ''} activa${d.alertas.length > 1 ? 's' : ''}`}</div>
    ${
      sinAlertas
        ? '<p class="lead">Tus condiciones ambientales están dentro de los parámetros saludables.</p>'
        : '<ul>' + d.alertas.map((a) => `<li><b>${a.tipo}:</b> ${a.mensaje}</li>`).join('') + '</ul>'
    }
    <div class="progress" style="margin-top:10px"><span style="width:${d.bienestar.nivel}%"></span></div>
    <div class="section-label" style="margin-top:8px">Indicador de bienestar</div>
    <div class="dotline"><span class="dot ${bienOk ? '' : 'amber'}"></span> ${d.bienestar.texto}</div>
    <div class="card-foot">Fuente: BME280</div>
  </div>`;

  const protegida = con.vpn;
  const cardConexion = `<div class="card" style="--i:2">
    <div class="card-head"><div class="icon-chip">${ICON.wifi}</div>
      <div><h3 class="card-title">Conectividad laboral</h3></div>
      <div class="card-tag">Red y VPN</div></div>
    <div class="connrow">
      ${ring(con.calidad ?? 0, { color: protegida ? 'var(--green)' : 'var(--amber)', label: protegida ? 'Protegida' : 'Revisar', sub: `${con.calidad ?? '—'}/100` })}
      <div class="txt"><div class="k">Estado de conexión</div><div class="v">${con.estado}</div><div class="s">${protegida ? 'VPN activa · Red segura' : 'Revisa tu red local'}</div></div>
    </div>
    <div class="rowhi" style="${protegida ? '' : 'background:var(--amber-soft);color:var(--amber)'}"><span class="dot ${protegida ? 'blue' : 'amber'}"></span> ${protegida ? 'VPN activa · Red segura' : 'Conexión inestable'}</div>
    <div class="card-foot">Fuente: Estado de red</div>
  </div>`;

  const capturaItems = d.queSeCaptura.map((x) => `<li>${x.fuente} · ${x.tipo}</li>`).join('') || '<li>Sin registros aún.</li>';
  const cardTransp = `<div class="card" id="card-transparencia" style="--i:3">
    <div class="card-head"><div class="icon-chip">${ICON.lock}</div>
      <div><h3 class="card-title">Transparencia de datos</h3></div>
      <div class="card-tag">Garantía</div></div>
    <p class="lead">Conoce qué información se recopila y qué no. Este panel nunca muestra tu productividad individual; esa lectura solo la ve tu líder, con fines de acompañamiento.</p>
    <button class="btn" id="btnTransp">¿Qué información recopilamos? ↗</button>
    <div id="transpPanel" hidden style="margin-top:16px">
      <div class="section-label">Se recoge</div>
      <ul>${capturaItems}</ul>
      <div class="section-label" style="margin-top:12px">No se recoge</div>
      <ul><li>El contenido de tus comunicaciones</li><li>Pulsaciones de teclado</li><li>Audio ni video</li><li>Las páginas o dominios que visitas</li></ul>
      <p class="card-foot">Estado de la captura: <b>${d.capturaActiva ? 'activa' : 'en pausa'}</b></p>
    </div>
  </div>`;

  $('app').innerHTML = `<div class="page">${pagehead(
    'Mi entorno laboral',
    'Vista personal. Condiciones contextuales de tu espacio de trabajo.',
    'Empleado'
  )}<div class="grid">${cardAmbiente}${cardAlertas}${cardConexion}${cardTransp}</div></div>`;
  $('btnTransp').addEventListener('click', () => {
    const p = $('transpPanel');
    p.hidden = !p.hidden;
  });
}

// ---------- Vista del líder ----------
function personHTML(i, idx) {
  const flags = i.banderas.length;
  const c = i.contexto || {};
  return `<div class="person" data-idx="${idx}">
    <div class="person-top">
      <div class="ava">${iniciales(i.usuario.nombre)}</div>
      <div class="id"><b>${i.usuario.nombre}</b><span>${i.usuario.arquetipo || 'equipo'}</span></div>
      <div class="right">
        ${flags ? `<span class="chip warn">${flags} para revisar</span>` : '<span class="chip ok">sin alertas</span>'}
        <span class="score">${i.compuesto}<small>/100</small></span>
        <span class="chev">${ICON.chev}</span>
      </div>
    </div>
    <div class="person-detail" hidden>
      ${dimsHTML(i.dimensiones)}
      <div class="ctx">Contexto, no puntúa: temperatura ${c.temperatura ?? '—'} °C, conexión ${c.calidad_conexion ?? '—'}/100. Cobertura: ${i.cobertura}/5 dimensiones con datos.</div>
      ${i.banderas.map((b) => `<div class="pregunta">${b}</div>`).join('')}
    </div>
  </div>`;
}

function bindPersons(scope) {
  scope.querySelectorAll('.person').forEach((p) => {
    p.querySelector('.person-top').addEventListener('click', () => {
      const det = p.querySelector('.person-detail');
      det.hidden = !det.hidden;
      p.classList.toggle('open', !det.hidden);
    });
  });
}

async function verLider() {
  const e = await api('/api/equipo');
  topbar([{ label: 'Equipo' }, { label: 'Preguntas', target: 'card-preguntas' }]);

  const resumen = `<div class="card" style="--i:0">
    <div class="card-head"><div class="icon-chip">${ICON.users}</div>
      <div><h3 class="card-title">Resumen del equipo</h3></div>
      <div class="card-tag">Métrica</div></div>
    <div class="connrow">
      ${ring(e.metricaLider, { color: colorPuntaje(e.metricaLider), label: e.metricaLider, sub: 'equipo' })}
      <div class="txt"><div class="k">Métrica del equipo</div><div class="v">${e.integrantes.length} integrantes</div><div class="s">Apoya tu decisión, no decide por ti.</div></div>
    </div>
    <div class="card-foot">Media geométrica de las cinco dimensiones. Una dimensión floja pesa en el resultado.</div>
  </div>`;

  const dimensiones = `<div class="card" style="--i:1">
    <div class="card-head"><div class="icon-chip">${ICON.chart}</div>
      <div><h3 class="card-title">Dimensiones del equipo</h3></div>
      <div class="card-tag">SPACE</div></div>
    ${dimsHTML(e.agregadoDimensiones)}
    <div class="card-foot">Promedio del equipo por dimensión del marco SPACE.</div>
  </div>`;

  const integrantes = `<div class="card span2" style="--i:2">
    <div class="card-head"><div class="icon-chip">${ICON.users}</div>
      <div><h3 class="card-title">Integrantes</h3><div class="card-sub">Toca un integrante para ver su desglose</div></div></div>
    <div class="people">${e.integrantes.map((i, idx) => personHTML(i, idx)).join('')}</div>
  </div>`;

  const preguntas = e.preguntasParaElLider.length
    ? `<div class="card span2" id="card-preguntas" style="--i:3">
        <div class="card-head"><div class="icon-chip green">${ICON.shield}</div>
          <div><h3 class="card-title">Preguntas para revisar</h3><div class="card-sub">Patrones para conversar, no sanciones</div></div></div>
        ${e.preguntasParaElLider
          .map((q) => q.preguntas.map((t) => `<div class="pregunta"><b>${q.integrante}:</b> ${t}</div>`).join(''))
          .join('')}
      </div>`
    : '';

  $('app').innerHTML = `<div class="page">${pagehead(
    'Mi equipo',
    'Vista de líder. Desempeño individual de cada integrante y del equipo.',
    'Líder de equipo'
  )}<div class="grid">${resumen}${dimensiones}${integrantes}${preguntas}</div></div>`;
  bindPersons($('app'));
}

// ---------- Vista del gerente ----------
async function verGerente() {
  const d = await api('/api/organizacion');
  topbar([{ label: 'Organización' }]);

  const resumen = `<div class="card" style="--i:0">
    <div class="card-head"><div class="icon-chip">${ICON.building}</div>
      <div><h3 class="card-title">Resumen de la organización</h3></div>
      <div class="card-tag">Métrica</div></div>
    <div class="connrow">
      ${ring(d.metricaOrganizacion, { color: colorPuntaje(d.metricaOrganizacion), label: d.metricaOrganizacion, sub: 'global' })}
      <div class="txt"><div class="k">Promedio de los equipos</div><div class="v">${d.equipos.length} equipos</div><div class="s">Vista en cascada, sin exponer a una persona.</div></div>
    </div>
    <div class="card-foot">La métrica de cada líder es la agregación de su equipo.</div>
  </div>`;

  const equipos = `<div class="card span2" style="--i:1">
    <div class="card-head"><div class="icon-chip">${ICON.users}</div>
      <div><h3 class="card-title">Equipos</h3><div class="card-sub">Toca ver equipo para bajar a los integrantes</div></div></div>
    <div class="people">${d.equipos
      .map(
        (eq) => `<div class="team">
      ${ring(eq.metricaLider, { size: 62, color: colorPuntaje(eq.metricaLider), label: eq.metricaLider })}
      <div class="info">
        <b>${eq.lider.nombre}</b> <span>· ${eq.tamano} personas</span>
        <div class="dimsmall">${ORDEN.map((k) => `<i style="--w:${eq.agregadoDimensiones[k]}%"></i>`).join('')}</div>
      </div>
      ${eq.preguntasAbiertas ? `<span class="chip warn">${eq.preguntasAbiertas} para revisar</span>` : '<span class="chip ok">al día</span>'}
      <button class="btn ghost" data-lider="${eq.lider.id}" data-nombre="${eq.lider.nombre}">Ver equipo</button>
    </div>`
      )
      .join('')}</div>
  </div>`;

  $('app').innerHTML = `<div class="page">${pagehead(
    'Organización',
    'Vista de gerente. Los equipos en cascada y la métrica de cada líder.',
    'Gerente'
  )}<div class="grid">${resumen}${equipos}</div><div id="detalle" style="margin-top:22px"></div></div>`;

  $('app')
    .querySelectorAll('button[data-lider]')
    .forEach((b) => b.addEventListener('click', () => verEquipoDeGerente(b.dataset.lider, b.dataset.nombre)));
}

async function verEquipoDeGerente(liderId, nombre) {
  const e = await api(`/api/organizacion/equipo/${liderId}`);
  const cont = $('detalle');
  cont.className = 'card span2';
  cont.innerHTML = `<div class="card-head"><div class="icon-chip">${ICON.users}</div>
      <div><h3 class="card-title">Equipo de ${nombre}</h3><div class="card-sub">Métrica del equipo: ${e.metricaLider}/100</div></div></div>
    <div style="margin-bottom:14px">${dimsHTML(e.agregadoDimensiones)}</div>
    <div class="people">${e.integrantes.map((i, idx) => personHTML(i, idx)).join('')}</div>`;
  bindPersons(cont);
  cont.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

renderLogin();
