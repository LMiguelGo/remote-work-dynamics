// Tiempos del tablero del lider en Chrome sin interfaz (Actividad 5). Uso: LIDER_CLAVE=... node render.mjs
// Por repeticion: (1) carga del tablero sin cache hasta ver las filas del equipo,
// (2) clic en la fila de empleado1 hasta ver sus 5 dimensiones, (3) clic en una dimension hasta ver sus graficas dibujadas.
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BASE = 'http://localhost/';
const REP = Number(process.env.REP || 10);
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PUERTO = 9333 + Math.floor(Math.random() * 300);
const perfil = mkdtempSync(join(tmpdir(), 'cdp-'));
const proc = spawn(CHROME, ['--headless=new', '--disable-gpu', `--remote-debugging-port=${PUERTO}`, `--user-data-dir=${perfil}`, '--window-size=1366,900', 'about:blank'], { stdio: 'ignore' });
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

async function wsUrl() {
  for (let i = 0; i < 60; i++) {
    try {
      const l = await (await fetch(`http://127.0.0.1:${PUERTO}/json/list`)).json();
      const p = l.find((t) => t.type === 'page');
      if (p) return p.webSocketDebuggerUrl;
    } catch {}
    await dormir(250);
  }
  throw new Error('Chrome no arranco');
}
const ws = new WebSocket(await wsUrl());
await new Promise((r) => ws.addEventListener('open', r));
let id = 0;
const pend = new Map();
ws.addEventListener('message', (m) => {
  const d = JSON.parse(m.data);
  if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); }
});
const enviar = (method, params = {}) => new Promise((r) => { const n = ++id; pend.set(n, r); ws.send(JSON.stringify({ id: n, method, params })); });
const evaluar = async (expression) => {
  const r = await enviar('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text);
  return r.result?.result?.value;
};
// Espera dentro de la pagina a que aparezca el selector y se pinte (dos requestAnimationFrame).
const hasta = (sel, desde = 'performance.now()') => `new Promise((res, rej) => { const t0 = ${desde}; const fin = Date.now() + 30000;
  (function mirar() { if (document.querySelector(${JSON.stringify(sel)})) { requestAnimationFrame(() => requestAnimationFrame(() => res(performance.now() - t0))); }
  else if (Date.now() > fin) rej(new Error('no aparecio ${sel}')); else requestAnimationFrame(mirar); })(); })`;

await enviar('Runtime.enable'); await enviar('Page.enable'); await enviar('Network.enable');
await enviar('Page.navigate', { url: BASE }); await dormir(1500);
const ok = await evaluar(`(async () => { const r = await fetch('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'lider1', clave: ${JSON.stringify(process.env.LIDER_CLAVE)} }) }); const d = await r.json(); if (!d.token) return 'FALLO ' + r.status; sessionStorage.setItem('rwd_token', d.token); sessionStorage.setItem('rwd_user', JSON.stringify(d.usuario)); return 'ok'; })()`);
if (ok !== 'ok') throw new Error(ok);
await enviar('Network.setCacheDisabled', { cacheDisabled: true });

const res = [];
for (let i = 0; i < REP; i++) {
  await enviar('Page.navigate', { url: BASE });
  await dormir(50);
  const tablero = await evaluar(hasta('tr.filarow', '0')); // desde el inicio de la navegacion
  const detalle = await evaluar(`(() => { const fila = [...document.querySelectorAll('tr.filarow')].find((f) => f.textContent.includes('empleado1')); window.__t0 = performance.now(); fila.click(); return ${hasta('.an-dim', 'window.__t0')}; })()`);
  const graficas = await evaluar(`(() => { const d = [...document.querySelectorAll('.an-dim')].find((b) => !b.textContent.includes('Sin resultado')); window.__t1 = performance.now(); d.click(); return ${hasta('.an-chart svg', 'window.__t1')}; })()`);
  const n = await evaluar(`document.querySelectorAll('.an-chart svg').length`);
  const nav = await evaluar(`(() => { const e = performance.getEntriesByType('navigation')[0]; const lcp = performance.getEntriesByType('paint').find((p) => p.name === 'first-contentful-paint'); return { fcp: lcp ? lcp.startTime : null, load: e.loadEventEnd }; })()`);
  res.push({ tablero, detalle, graficas, n_graficas: n, fcp: nav.fcp });
}
const med = (k) => { const s = res.map((r) => r[k]).sort((a, b) => a - b); return { p50: +s[Math.floor((s.length - 1) / 2)].toFixed(0), p95: +s[Math.ceil(0.95 * s.length) - 1].toFixed(0), max: +s[s.length - 1].toFixed(0) }; };
console.log(JSON.stringify({ repeticiones: REP, graficas_por_dimension: res[0].n_graficas, fcp_ms: med('fcp'), carga_tablero_ms: med('tablero'), abrir_integrante_ms: med('detalle'), dibujar_graficas_ms: med('graficas') }));
ws.close(); proc.kill(); process.exit(0);
