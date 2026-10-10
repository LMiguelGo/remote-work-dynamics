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
  clock:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/></svg>',
  gauge:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 18a8 8 0 1 1 16 0"/><path d="M12 18l4-5"/><circle cx="12" cy="18" r="1.2" fill="currentColor" stroke="none"/></svg>',
  cpu:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="7" y="7" width="10" height="10" rx="2"/><path d="M9.5 2v3M14.5 2v3M9.5 19v3M14.5 19v3M2 9.5h3M2 14.5h3M19 9.5h3M19 14.5h3"/></svg>',
  pulse:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12h4l2-6 4 12 2-6h6"/></svg>',
  cog:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.3 1a7 7 0 0 0-2-1.2L16.2 2h-4l-.4 2.5a7 7 0 0 0-2 1.2l-2.3-1-2 3.4 2 1.5A7 7 0 0 0 5 12a7 7 0 0 0 .1 1.2l-2 1.5 2 3.4 2.3-1a7 7 0 0 0 2 1.2l.4 2.5h4l.4-2.5a7 7 0 0 0 2-1.2l2.3 1 2-3.4-2-1.5A7 7 0 0 0 19 12Z"/></svg>',
};

let token = null;
let usuario = null;

const $ = (id) => document.getElementById(id);

// ---------- Chart.js: arranque, plugin de franjas y registro de instancias ----------

// Plugin propio para pintar franjas de alerta de fondo (optimo / precaucion / critico)
// detras de una serie temporal. Evita depender de un segundo paquete.
const bandasAlerta = {
  id: 'bandasAlerta',
  beforeDraw(chart, args, opts) {
    const bands = opts && opts.bands;
    if (!bands || !bands.length) return;
    const y = chart.scales.y;
    const area = chart.chartArea;
    if (!y || !area) return;
    const ctx = chart.ctx;
    ctx.save();
    for (const b of bands) {
      const yTo = y.getPixelForValue(Math.min(b.to, y.max));
      const yFrom = y.getPixelForValue(Math.max(b.from, y.min));
      ctx.fillStyle = b.color;
      ctx.fillRect(area.left, yTo, area.right - area.left, yFrom - yTo);
    }
    ctx.restore();
  },
};

let CHART_LISTO = false;
function prepararChart() {
  if (CHART_LISTO || !window.Chart) return;
  if (Chart.registerables) Chart.register(...Chart.registerables);
  Chart.register(bandasAlerta);
  Chart.defaults.font.family = "'Plus Jakarta Sans', system-ui, sans-serif";
  Chart.defaults.color = '#5b6475';
  Chart.defaults.plugins.legend.labels.boxWidth = 12;
  CHART_LISTO = true;
}

let charts = [];
function nuevoChart(canvasId, cfg) {
  prepararChart();
  const el = $(canvasId);
  if (!el || !window.Chart) return null;
  const c = new Chart(el.getContext('2d'), cfg);
  charts.push(c);
  return c;
}
function destruirCharts() {
  charts.forEach((c) => {
    try {
      c.destroy();
    } catch {}
  });
  charts = [];
}

// ---------- Polling para la vista en tiempo real ----------
let pollTimer = null;
function limpiarPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

// Se llama al entrar a cualquier vista: deja limpio lo de la vista anterior.
function limpiarVista() {
  destruirCharts();
  limpiarPolling();
}

// ---------- Semaforo segun el diccionario de metricas y umbrales ----------
const SEM = { ok: 'Óptimo', warn: 'Precaución', bad: 'Crítico', none: 'Sin dato' };

function nivelPuntaje(v) {
  if (v == null) return 'none';
  if (v >= 75) return 'ok';
  if (v >= 50) return 'warn';
  return 'bad';
}
function nivelTemperatura(t) {
  if (t == null) return 'none';
  if (t >= 20 && t <= 24) return 'ok';
  if (t >= 18 && t <= 26) return 'warn';
  return 'bad';
}
function nivelConexion(c) {
  if (c == null) return 'none';
  if (c >= 70) return 'ok';
  if (c >= 55) return 'warn';
  return 'bad';
}
function nivelExtralaboral(p) {
  if (p == null) return 'none';
  if (p <= 5) return 'ok';
  if (p <= 15) return 'warn';
  return 'bad';
}
function chipSem(nivel, texto) {
  return `<span class="sem ${nivel}">${texto != null ? texto : SEM[nivel]}</span>`;
}

const COLOR = {
  blue: '#2f6bed',
  green: '#16a34a',
  amber: '#f59e0b',
  red: '#ef4444',
  grid: 'rgba(17,24,39,.07)',
};

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
// Cada pestaña puede tener target (scroll a un ancla) u onSelect (cambia de vista).
function topbar(tabs, activeIndex = 0) {
  const bar = $('topbar');
  bar.hidden = false;
  bar.innerHTML = `<div class="topbar-in">
    <div class="brand"><span class="mark">${ICON.shield}</span> Espacio laboral</div>
    <nav class="nav">${tabs
      .map((t, i) => `<button data-i="${i}" class="${i === activeIndex ? 'active' : ''}">${t.label}</button>`)
      .join('')}</nav>
    <div class="userchip">
      <div class="who"><b>${usuario.nombre}</b><span>${rolTexto(usuario.rol)}</span></div>
      <div class="avatar">${iniciales(usuario.nombre)}</div>
      <button class="logout" id="salir">Salir</button>
    </div>
  </div>`;
  bar.querySelectorAll('.nav button').forEach((b) =>
    b.addEventListener('click', () => {
      const t = tabs[Number(b.dataset.i)];
      if (t.onSelect) {
        t.onSelect();
        return;
      }
      bar.querySelectorAll('.nav button').forEach((x) => x.classList.remove('active'));
      b.classList.add('active');
      if (!t.target) window.scrollTo({ top: 0, behavior: 'smooth' });
      else document.getElementById(t.target)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
  limpiarVista();
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
  limpiarVista();
  token = null;
  usuario = null;
  renderLogin();
}

// ---------- Vista del empleado ----------
async function verEmpleado() {
  limpiarVista();
  const d = await api('/api/mi-panel');
  topbar([{ label: 'Mi entorno' }, { label: 'Umbrales', target: 'card-umbrales' }, { label: 'Transparencia', target: 'card-transparencia' }]);

  const amb = d.ambiente;
  const con = d.conexion;
  const sinAlertas = d.alertas.length === 0;
  const bienOk = d.bienestar.nivel >= 80;

  const j = d.jornada;
  const abierta = j.estado === 'abierta';
  const ext = j.extralaboralPct;
  const extTexto = ext == null ? 'Sin jornadas cerradas aún' : `${ext > 0 ? '+' : ''}${ext}% frente a la jornada pactada`;
  const opciones15 = (sel) => [1, 2, 3, 4, 5].map((n) => `<option value="${n}"${n === sel ? ' selected' : ''}>${n}</option>`).join('');

  const cardJornada = `<div class="card" style="--i:0">
    <div class="card-head"><div class="icon-chip">${ICON.clock}</div>
      <div><h3 class="card-title">Mi jornada</h3></div>
      <div class="card-tag">Tiempo</div></div>
    <div class="dotline"><span class="dot ${abierta ? 'blue' : ''}"></span> Jornada ${abierta ? 'en curso' : 'cerrada'}${
    j.horasHoy != null ? ` · ${j.horasHoy} h hoy` : ''
  }</div>
    <div class="stats" style="margin-top:16px">
      <div class="stat"><div class="k">Jornada pactada</div><div class="v">${j.horasPactadas}<small>h</small></div></div>
      <div class="stat"><div class="k">Tiempo extralaboral</div><div class="v">${ext == null ? '—' : `${ext > 0 ? '+' : ''}${ext}`}<small>%</small></div></div>
    </div>
    <div class="ctx" style="margin-top:0">Contexto, no afecta tu evaluación: ${extTexto}.</div>
    <button class="btn ${abierta ? '' : 'solid'}" id="btnJornada" style="margin-top:16px">${abierta ? 'Finalizar jornada' : 'Iniciar jornada'}</button>
    ${
      d.encuestaPendiente
        ? `<div id="micro" style="margin-top:20px;border-top:1px dashed var(--line);padding-top:18px">
        <div class="section-label">Microencuesta al cerrar el día</div>
        <div class="field"><label>¿Cómo terminas el día? (1 muy mal · 5 muy bien)</label><select id="mEnps">${opciones15(4)}</select></div>
        <div class="field"><label>¿Pudiste concentrarte sin interrupciones? (1 nada · 5 mucho)</label><select id="mFlujo">${opciones15(4)}</select></div>
        <div class="field"><label>Nivel de fatiga al terminar (1 ninguna · 5 mucha)</label><select id="mFatiga">${opciones15(2)}</select></div>
        <button class="btn solid" id="btnMicro">Enviar microencuesta</button>
        <p class="card-foot">Alimenta tu dimensión de satisfacción y bienestar. Tú no ves el puntaje; solo tu líder, para acompañarte.</p>
      </div>`
        : '<p class="card-foot">Ya respondiste la microencuesta de hoy. Gracias.</p>'
    }
  </div>`;

  const cardAmbiente = `<div class="card" style="--i:1">
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

  const cardAlertas = `<div class="card" style="--i:2">
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
  const cardConexion = `<div class="card" style="--i:3">
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

  const u = d.umbrales;
  const cardUmbrales = `<div class="card" id="card-umbrales" style="--i:4">
    <div class="card-head"><div class="icon-chip">${ICON.gauge}</div>
      <div><h3 class="card-title">Mis umbrales</h3></div>
      <div class="card-tag">Ambiente</div></div>
    <p class="lead">Define desde qué valores quieres que te avise el sistema. Al superarlos se genera una alerta de bienestar, que es contexto y no afecta tu evaluación.</p>
    <div class="umbral-grid">
      <div class="field"><label>Temperatura mínima (°C)</label><input id="uTempMin" type="number" step="0.5" value="${u.temperatura.minimo ?? ''}" /></div>
      <div class="field"><label>Temperatura máxima (°C)</label><input id="uTempMax" type="number" step="0.5" value="${u.temperatura.maximo ?? ''}" /></div>
      <div class="field"><label>Humedad mínima (%)</label><input id="uHumMin" type="number" value="${u.humedad.minimo ?? ''}" /></div>
      <div class="field"><label>Humedad máxima (%)</label><input id="uHumMax" type="number" value="${u.humedad.maximo ?? ''}" /></div>
      <div class="field"><label>Conexión mínima (/100)</label><input id="uConMin" type="number" value="${u.calidad_conexion.minimo ?? ''}" /></div>
    </div>
    <button class="btn" id="btnUmbrales">Guardar umbrales</button>
    <span id="umbralOk" class="dotline" hidden style="margin-top:12px"><span class="dot"></span> Umbrales actualizados</span>
  </div>`;

  const capturaItems = d.queSeCaptura.map((x) => `<li>${x.fuente} · ${x.tipo}</li>`).join('') || '<li>Sin registros aún.</li>';
  const cardTransp = `<div class="card" id="card-transparencia" style="--i:5">
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
  )}<div class="grid">${cardJornada}${cardAmbiente}${cardAlertas}${cardConexion}${cardUmbrales}${cardTransp}</div></div>`;

  $('btnTransp').addEventListener('click', () => {
    const p = $('transpPanel');
    p.hidden = !p.hidden;
  });

  $('btnJornada').addEventListener('click', async () => {
    await api(`/api/jornada/${abierta ? 'finalizar' : 'iniciar'}`, { method: 'POST' });
    await verEmpleado();
  });

  const btnMicro = $('btnMicro');
  if (btnMicro)
    btnMicro.addEventListener('click', async () => {
      await api('/api/encuesta-diaria', {
        method: 'POST',
        body: JSON.stringify({
          enps: Number($('mEnps').value),
          flujo: Number($('mFlujo').value),
          fatiga: Number($('mFatiga').value),
        }),
      });
      await verEmpleado();
    });

  $('btnUmbrales').addEventListener('click', async () => {
    const num = (id) => ($(id).value === '' ? null : Number($(id).value));
    await api('/api/umbrales', {
      method: 'PUT',
      body: JSON.stringify({
        temperatura: { minimo: num('uTempMin'), maximo: num('uTempMax') },
        humedad: { minimo: num('uHumMin'), maximo: num('uHumMax') },
        calidad_conexion: { minimo: num('uConMin'), maximo: null },
      }),
    });
    const ok = $('umbralOk');
    ok.hidden = false;
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
      <div class="ctx">Contexto, no puntúa: temperatura ${c.temperatura ?? '—'} °C, conexión ${c.calidad_conexion ?? '—'}/100, tiempo extralaboral ${
    c.extralaboral_pct == null ? '—' : `${c.extralaboral_pct > 0 ? '+' : ''}${c.extralaboral_pct}%`
  }. Cobertura: ${i.cobertura}/5 dimensiones con datos.</div>
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

// Fila de la tabla de actividad general del equipo, con indicadores en semaforo y detalle.
function filaEquipo(i, idx) {
  const c = i.contexto || {};
  const celdaDim = (d) => `<td class="numcell">${chipSem(nivelPuntaje(i.dimensiones[d]), i.dimensiones[d])}</td>`;
  const ctxChips =
    `${chipSem(nivelTemperatura(c.temperatura), c.temperatura != null ? c.temperatura + '°' : '—')} ` +
    `${chipSem(nivelConexion(c.calidad_conexion), c.calidad_conexion != null ? c.calidad_conexion : '—')} ` +
    `${chipSem(nivelExtralaboral(c.extralaboral_pct), c.extralaboral_pct != null ? (c.extralaboral_pct > 0 ? '+' : '') + c.extralaboral_pct + '%' : '—')}`;
  const flags = i.banderas.length;
  return `<tr class="filarow" data-idx="${idx}">
      <td><div class="idcell"><span class="ava sm">${iniciales(i.usuario.nombre)}</span><div><b>${i.usuario.nombre}</b><span>${i.usuario.arquetipo || 'equipo'}</span></div></div></td>
      <td class="numcell"><span class="score">${i.compuesto}</span></td>
      ${ORDEN.map(celdaDim).join('')}
      <td class="ctxcell">${ctxChips}</td>
      <td class="numcell">${flags ? `<span class="chip warn">${flags}</span>` : '<span class="chip ok">0</span>'}<span class="chev">${ICON.chev}</span></td>
    </tr>
    <tr class="filadetail" hidden><td colspan="9">
      ${dimsHTML(i.dimensiones)}
      <div class="ctx">Contexto, no puntúa: temperatura ${c.temperatura ?? '—'} °C, conexión ${c.calidad_conexion ?? '—'}/100, tiempo extralaboral ${
    c.extralaboral_pct == null ? '—' : `${c.extralaboral_pct > 0 ? '+' : ''}${c.extralaboral_pct}%`
  }. Cobertura: ${i.cobertura}/5 dimensiones con datos.</div>
      ${i.banderas.map((b) => `<div class="pregunta">${b}</div>`).join('')}
    </td></tr>`;
}

async function verLider() {
  limpiarVista();
  const e = await api('/api/equipo');
  topbar([{ label: 'Equipo' }, { label: 'Patrones', target: 'card-temporal' }, { label: 'Preguntas', target: 'card-preguntas' }]);

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

  const radar = `<div class="card" style="--i:1">
    <div class="card-head"><div class="icon-chip">${ICON.chart}</div>
      <div><h3 class="card-title">Métricas agregadas</h3><div class="card-sub">Perfil SPACE del equipo</div></div>
      <div class="card-tag">SPACE</div></div>
    <div class="chart-box"><canvas id="chartRadarEquipo"></canvas></div>
    <div class="card-foot">Promedio del equipo por dimensión, de 0 a 100.</div>
  </div>`;

  const temporal = `<div class="card span2" id="card-temporal" style="--i:2">
    <div class="card-head"><div class="icon-chip">${ICON.chart}</div>
      <div><h3 class="card-title">Patrones temporales</h3><div class="card-sub">Fatiga y ánimo del equipo por día (microencuesta)</div></div>
      <div class="card-tag">Correlación S</div></div>
    ${
      e.serieAnimo && e.serieAnimo.length
        ? '<div class="chart-box wide"><canvas id="chartTemporal"></canvas></div><div class="card-foot">Doble eje: barras de fatiga (1 a 5) y líneas de ánimo y flujo. Cuando la fatiga sube hacia el final del período, el ánimo suele bajar.</div>'
        : '<p class="lead">Aún no hay microencuestas suficientes en el período para trazar el patrón.</p>'
    }
  </div>`;

  const tabla = `<div class="card span2" style="--i:3">
    <div class="card-head"><div class="icon-chip">${ICON.users}</div>
      <div><h3 class="card-title">Actividad general del equipo</h3><div class="card-sub">Toca una fila para ver el desglose. Color según el diccionario de umbrales</div></div></div>
    <div class="tablewrap"><table class="tabla">
      <thead><tr><th>Integrante</th><th>Métrica</th>${ORDEN.map((d) => `<th>${d}</th>`).join('')}<th>Contexto (T · Conex · Extra)</th><th>Revisar</th></tr></thead>
      <tbody>${e.integrantes.map((i, idx) => filaEquipo(i, idx)).join('')}</tbody>
    </table></div>
    <div class="leyenda">${chipSem('ok', 'Óptimo')} ${chipSem('warn', 'Precaución')} ${chipSem('bad', 'Crítico')} <span class="leyenda-nota">Las columnas S·P·A·C·E van de 0 a 100; el contexto usa los umbrales del diccionario.</span></div>
  </div>`;

  const preguntas = e.preguntasParaElLider.length
    ? `<div class="card span2" id="card-preguntas" style="--i:4">
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
  )}<div class="grid">${resumen}${radar}${temporal}${tabla}${preguntas}</div></div>`;

  // Expandir filas de la tabla.
  $('app')
    .querySelectorAll('.filarow')
    .forEach((row) =>
      row.addEventListener('click', () => {
        const det = row.nextElementSibling;
        det.hidden = !det.hidden;
        row.classList.toggle('open', !det.hidden);
      })
    );

  // Radar del equipo.
  nuevoChart('chartRadarEquipo', {
    type: 'radar',
    data: {
      labels: ORDEN.map((d) => DIMN[d]),
      datasets: [
        {
          label: 'Equipo',
          data: ORDEN.map((d) => e.agregadoDimensiones[d]),
          fill: true,
          backgroundColor: 'rgba(47,107,237,.15)',
          borderColor: COLOR.blue,
          pointBackgroundColor: COLOR.blue,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: { r: { min: 0, max: 100, ticks: { stepSize: 25, backdropColor: 'transparent' }, grid: { color: COLOR.grid }, pointLabels: { font: { size: 10 } } } },
      plugins: { legend: { display: false } },
    },
  });

  // Patrón temporal de doble eje: fatiga (barras) vs ánimo y flujo (líneas).
  if (e.serieAnimo && e.serieAnimo.length) {
    const etiquetas = e.serieAnimo.map((p) => p.fecha.slice(8, 10));
    nuevoChart('chartTemporal', {
      data: {
        labels: etiquetas,
        datasets: [
          { type: 'bar', label: 'Fatiga', data: e.serieAnimo.map((p) => p.fatiga), backgroundColor: 'rgba(239,68,68,.35)', borderColor: COLOR.red, borderWidth: 1, yAxisID: 'y' },
          { type: 'line', label: 'Ánimo (eNPS)', data: e.serieAnimo.map((p) => p.enps), borderColor: COLOR.green, backgroundColor: COLOR.green, tension: 0.3, yAxisID: 'y2' },
          { type: 'line', label: 'Flujo', data: e.serieAnimo.map((p) => p.flujo), borderColor: COLOR.blue, backgroundColor: COLOR.blue, tension: 0.3, yAxisID: 'y2' },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { title: { display: true, text: 'Día del período' }, grid: { display: false } },
          y: { position: 'left', min: 1, max: 5, title: { display: true, text: 'Fatiga (1-5)' }, grid: { color: COLOR.grid } },
          y2: { position: 'right', min: 1, max: 5, title: { display: true, text: 'Ánimo / flujo (1-5)' }, grid: { drawOnChartArea: false } },
        },
      },
    });
  }
}

// ---------- Vista del gerente ----------
async function verGerente() {
  limpiarVista();
  const d = await api('/api/organizacion');
  topbar([{ label: 'Organización', onSelect: verGerente }, { label: 'Operación', onSelect: verOperacion }], 0);

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

// ---------- Vista de operación (gerente): dispositivos, conectividad y configuración ----------
function nivelHumedad(h) {
  if (h == null) return 'none';
  if (h >= 40 && h <= 60) return 'ok';
  if (h >= 30 && h <= 70) return 'warn';
  return 'bad';
}
function nivelRuido(r) {
  if (r == null) return 'none';
  if (r < 50) return 'ok';
  if (r <= 65) return 'warn';
  return 'bad';
}
function fmtHora(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  return isNaN(d) ? ts : d.toLocaleString();
}
function valDe(l) {
  return l && l.valor != null ? l.valor : null;
}

function bandasConexion(b) {
  const crit = b.critico;
  const prec = b.precaucion;
  return [
    { from: 0, to: crit, color: 'rgba(239,68,68,.10)' },
    { from: crit, to: prec, color: 'rgba(245,158,11,.10)' },
    { from: prec, to: 100, color: 'rgba(22,163,74,.10)' },
  ];
}
function bandasTemp(b) {
  const [oA, oB] = b.optimo;
  const [pA, pB] = b.precaucion;
  return [
    { from: 0, to: pA, color: 'rgba(239,68,68,.10)' },
    { from: pA, to: oA, color: 'rgba(245,158,11,.10)' },
    { from: oA, to: oB, color: 'rgba(22,163,74,.10)' },
    { from: oB, to: pB, color: 'rgba(245,158,11,.10)' },
    { from: pB, to: 50, color: 'rgba(239,68,68,.10)' },
  ];
}

function filaDispositivo(d) {
  const t = valDe(d.lecturas.temperatura);
  const h = valDe(d.lecturas.humedad);
  const r = valDe(d.lecturas.ruido);
  const c = valDe(d.lecturas.calidad_conexion);
  const estadoClase = d.estado === 'en vivo' ? 'ok' : d.estado === 'con historial' ? 'warn' : 'bad';
  return `<tr>
    <td><div class="idcell"><span class="ava sm">${ICON.cpu}</span><div><b>${d.dispositivo}</b><span>${d.descripcion}</span></div></div></td>
    <td>${d.asignadoA}</td>
    <td>${chipSem(estadoClase, d.estado)}</td>
    <td class="numcell">${chipSem(nivelTemperatura(t), t != null ? t + '°' : '—')}</td>
    <td class="numcell">${chipSem(nivelHumedad(h), h != null ? h + '%' : '—')}</td>
    <td class="numcell">${chipSem(nivelRuido(r), r != null ? r + ' dB' : '—')}</td>
    <td class="numcell">${chipSem(nivelConexion(c), c != null ? c : '—')}</td>
    <td class="tsmall">${fmtHora(d.ultimaLectura)}</td>
  </tr>`;
}

function filaEvento(ev) {
  const clase = ev.tipo === 'conexion' ? 'bad' : 'warn';
  return `<tr>
    <td class="tsmall">${fmtHora(ev.ts)}</td>
    <td>${ev.usuario} ${chipSem(clase, ev.tipo)}</td>
    <td>${ev.mensaje}</td>
  </tr>`;
}

function htmlConector(c) {
  const clase = c.estado === 'activo' ? 'ok' : 'bad';
  return `<div class="conector"><span class="dot ${c.estado === 'activo' ? '' : 'amber'}"></span><b>${c.nombre}</b> ${chipSem(clase, c.estado)}<span class="tsmall">${fmtHora(c.ultimaIngesta)}</span></div>`;
}

async function verOperacion() {
  limpiarVista();
  const [cfg, dz, cn, salud] = await Promise.all([
    api('/api/operacion/config'),
    api('/api/operacion/dispositivos'),
    api('/api/operacion/conectividad'),
    api('/api/salud'),
  ]);
  topbar([{ label: 'Organización', onSelect: verGerente }, { label: 'Operación', onSelect: verOperacion }], 1);

  const cardDisp = `<div class="card span2" style="--i:0">
    <div class="card-head"><div class="icon-chip">${ICON.cpu}</div>
      <div><h3 class="card-title">Estado de dispositivos</h3><div class="card-sub">Sensores y su última lectura · se refresca solo</div></div>
      <div class="card-tag">En vivo</div></div>
    <div class="tablewrap"><table class="tabla">
      <thead><tr><th>Dispositivo</th><th>Asignado a</th><th>Estado</th><th>Temp</th><th>Humedad</th><th>Ruido</th><th>Conexión</th><th>Última lectura</th></tr></thead>
      <tbody id="tbodyDisp">${dz.dispositivos.map(filaDispositivo).join('')}</tbody>
    </table></div>
    <div class="card-foot">Actualizado: <span id="tsPoll">${new Date().toLocaleTimeString()}</span> · intervalo ${cfg.intervaloSegundos}s</div>
  </div>`;

  const cardConex = `<div class="card span2" style="--i:1">
    <div class="card-head"><div class="icon-chip">${ICON.wifi}</div>
      <div><h3 class="card-title">Eventos de conectividad</h3><div class="card-sub">Calidad de conexión y temperatura con franjas de alerta</div></div>
      <div class="card-tag">Tiempo real</div></div>
    <div class="dualchart">
      <div class="chart-box"><canvas id="chartConex"></canvas></div>
      <div class="chart-box"><canvas id="chartTemp"></canvas></div>
    </div>
    <div class="leyenda" style="margin-top:6px">${chipSem('ok', 'Óptimo')} ${chipSem('warn', 'Precaución')} ${chipSem('bad', 'Crítico')} <span class="leyenda-nota">Las franjas salen de los umbrales del diccionario.</span></div>
  </div>`;

  const cardEventos = `<div class="card span2" style="--i:2">
    <div class="card-head"><div class="icon-chip green">${ICON.pulse}</div>
      <div><h3 class="card-title">Alertas de contexto recientes</h3><div class="card-sub">Lecturas que rebasaron un umbral</div></div></div>
    <div class="tablewrap"><table class="tabla">
      <thead><tr><th>Cuándo</th><th>Quién · tipo</th><th>Detalle</th></tr></thead>
      <tbody id="tbodyEventos">${cn.eventos.length ? cn.eventos.map(filaEvento).join('') : '<tr><td colspan="3">Sin eventos recientes.</td></tr>'}</tbody>
    </table></div>
  </div>`;

  const cardSalud = `<div class="card" style="--i:3">
    <div class="card-head"><div class="icon-chip">${ICON.shield}</div>
      <div><h3 class="card-title">Salud de conectores</h3><div class="card-sub">RNF-05</div></div></div>
    <div class="conectores">${salud.conectores.map(htmlConector).join('')}</div>
    <div class="card-foot">Base: ${salud.base} · estado general: ${salud.estado}</div>
  </div>`;

  const cardConfig = `<div class="card" style="--i:4">
    <div class="card-head"><div class="icon-chip">${ICON.cog}</div>
      <div><h3 class="card-title">Configuración de monitoreo</h3></div>
      <div class="card-tag">Admin</div></div>
    <div class="field"><label>Intervalo de muestreo en vivo (segundos)</label><input id="cfgIntervalo" type="number" min="2" max="60" value="${cfg.intervaloSegundos}" /></div>
    <button class="btn" id="btnCfg">Guardar</button>
    <span id="cfgOk" class="dotline" hidden style="margin-top:10px"><span class="dot"></span> Intervalo actualizado</span>
  </div>`;

  const cardDic = `<div class="card span2" style="--i:5">
    <div class="card-head"><div class="icon-chip">${ICON.chart}</div>
      <div><h3 class="card-title">Diccionario de métricas y umbrales</h3><div class="card-sub">Referencia del equipo. Define el semáforo de todo el tablero</div></div></div>
    <div class="tablewrap"><table class="tabla compacta">
      <thead><tr><th>Dim</th><th>Métrica</th><th>Óptimo</th><th>Precaución</th><th>Crítico</th></tr></thead>
      <tbody>${cfg.diccionario
        .map((m) => `<tr><td><b>${m.dimension}</b></td><td>${m.metrica}</td><td>${chipSem('ok', m.optimo)}</td><td>${chipSem('warn', m.precaucion)}</td><td>${chipSem('bad', m.critico)}</td></tr>`)
        .join('')}</tbody>
    </table></div>
  </div>`;

  $('app').innerHTML = `<div class="page">${pagehead(
    'Operación y dispositivos',
    'Panel administrativo. Estado de la infraestructura telemática, sin exponer la productividad de ninguna persona.',
    'Gerente'
  )}<div class="grid">${cardDisp}${cardConex}${cardEventos}${cardSalud}${cardConfig}${cardDic}</div></div>`;

  const b = cn.serie.bandas;
  const ejeTiempo = (serie) => serie.map((p) => (p.ts || '').slice(11, 16));

  const chConex = nuevoChart('chartConex', {
    type: 'line',
    data: {
      labels: ejeTiempo(cn.serie.calidad_conexion),
      datasets: [{ label: 'Calidad de conexión (/100)', data: cn.serie.calidad_conexion.map((p) => p.valor), borderColor: COLOR.blue, backgroundColor: COLOR.blue, tension: 0.25, pointRadius: 0 }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: { x: { grid: { display: false }, ticks: { maxTicksLimit: 8 } }, y: { min: 0, max: 100, grid: { color: COLOR.grid } } },
      plugins: { legend: { display: true }, bandasAlerta: { bands: bandasConexion(b.calidad_conexion) } },
    },
  });

  const chTemp = nuevoChart('chartTemp', {
    type: 'line',
    data: {
      labels: ejeTiempo(cn.serie.temperatura),
      datasets: [{ label: 'Temperatura (°C)', data: cn.serie.temperatura.map((p) => p.valor), borderColor: COLOR.amber, backgroundColor: COLOR.amber, tension: 0.25, pointRadius: 0 }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: { x: { grid: { display: false }, ticks: { maxTicksLimit: 8 } }, y: { min: 10, max: 35, grid: { color: COLOR.grid } } },
      plugins: { legend: { display: true }, bandasAlerta: { bands: bandasTemp(b.temperatura) } },
    },
  });

  // Guardar la configuración de monitoreo.
  $('btnCfg').addEventListener('click', async () => {
    const nueva = await api('/api/operacion/config', { method: 'PUT', body: JSON.stringify({ intervaloSegundos: Number($('cfgIntervalo').value) }) });
    $('cfgIntervalo').value = nueva.intervaloSegundos;
    $('cfgOk').hidden = false;
    arrancarPolling(nueva.intervaloSegundos);
  });

  // Polling: refresca dispositivos, eventos y las dos series sin recargar la página.
  function actualizarSerie(ch, serie) {
    if (!ch) return;
    ch.data.labels = ejeTiempo(serie);
    ch.data.datasets[0].data = serie.map((p) => p.valor);
    ch.update('none');
  }
  async function tick() {
    try {
      const [dz2, cn2] = await Promise.all([api('/api/operacion/dispositivos'), api('/api/operacion/conectividad')]);
      const tb = $('tbodyDisp');
      if (!tb) return; // se cambió de vista
      tb.innerHTML = dz2.dispositivos.map(filaDispositivo).join('');
      $('tbodyEventos').innerHTML = cn2.eventos.length ? cn2.eventos.map(filaEvento).join('') : '<tr><td colspan="3">Sin eventos recientes.</td></tr>';
      actualizarSerie(chConex, cn2.serie.calidad_conexion);
      actualizarSerie(chTemp, cn2.serie.temperatura);
      $('tsPoll').textContent = new Date().toLocaleTimeString();
    } catch {}
  }
  function arrancarPolling(segundos) {
    limpiarPolling();
    pollTimer = setInterval(tick, Math.max(2, segundos) * 1000);
  }
  arrancarPolling(cfg.intervaloSegundos);
}

renderLogin();
