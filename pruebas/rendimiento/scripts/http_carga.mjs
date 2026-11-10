// Prueba de carga HTTP de la API (Actividad 5). Corre en el host con Node 22:
//   LIDER_CLAVE=... GERENTE_CLAVE=... node http_carga.mjs
// Usuarios virtuales en lazo cerrado (sin pausa) contra http://localhost (proxy nginx -> backend).
// Cada usuario virtual recorre la mezcla de rutas de un tablero de lider y de gerente.
const BASE = process.env.BASE || 'http://localhost';
const NIVELES = (process.env.NIVELES || '1,10,25,50,100,200').split(',').map(Number);
const SEG = Number(process.env.SEG || 20);

async function login(username, clave) {
  const r = await fetch(`${BASE}/api/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, clave }),
  });
  const j = await r.json();
  if (!j.token) throw new Error(`login ${username}: ${r.status}`);
  return j.token;
}

function pct(arr, p) {
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.ceil((p / 100) * s.length) - 1))];
}

const tl = await login('lider1', process.env.LIDER_CLAVE);
const tg = await login('gerente1', process.env.GERENTE_CLAVE);
const RUTAS = [
  ['lider: /api/equipo', '/api/equipo', tl],
  ['lider: analitica integrante', '/api/equipo/integrantes/4/analitica', tl],
  ['gerente: /api/organizacion', '/api/organizacion', tg],
  ['gerente: analitica integrante', '/api/organizacion/integrantes/4/analitica', tg],
  ['gerente: operacion dispositivos', '/api/operacion/dispositivos', tg],
  ['gerente: operacion conectividad', '/api/operacion/conectividad', tg],
];

async function una(ruta) {
  const t0 = performance.now();
  try {
    const r = await fetch(BASE + ruta[1], { headers: { authorization: `Bearer ${ruta[2]}` } });
    await r.arrayBuffer();
    return { ms: performance.now() - t0, ok: r.status === 200, ruta: ruta[0] };
  } catch {
    return { ms: performance.now() - t0, ok: false, ruta: ruta[0] };
  }
}

// Calentamiento y tiempos en frio por ruta (1 usuario)
const porRuta = {};
for (const ruta of RUTAS) {
  const ms = [];
  for (let i = 0; i < 30; i++) ms.push((await una(ruta)).ms);
  porRuta[ruta[0]] = { p50: +pct(ms, 50).toFixed(1), p95: +pct(ms, 95).toFixed(1) };
}
console.log(JSON.stringify({ fase: 'por_ruta_1_usuario_30_rep', porRuta }));

for (const n of NIVELES) {
  const res = [];
  const fin = Date.now() + SEG * 1000;
  const t0 = Date.now();
  await Promise.all(
    Array.from({ length: n }, async (_, u) => {
      let k = u;
      while (Date.now() < fin) {
        res.push(await una(RUTAS[k % RUTAS.length]));
        k++;
      }
    })
  );
  const ms = res.map((r) => r.ms);
  const err = res.filter((r) => !r.ok).length;
  console.log(
    JSON.stringify({
      usuarios: n,
      peticiones: res.length,
      req_s: +(res.length / ((Date.now() - t0) / 1000)).toFixed(1),
      p50_ms: +pct(ms, 50).toFixed(1),
      p95_ms: +pct(ms, 95).toFixed(1),
      max_ms: +Math.max(...ms).toFixed(1),
      errores_pct: +((100 * err) / res.length).toFixed(2),
    })
  );
}
