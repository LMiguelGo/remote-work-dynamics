// Simula el nodo de sensores del borde publicando lecturas hacia la ingesta.
// Para conectar MQTT real basta con leer del broker y hacer el mismo POST a /ingesta/sensor.

const BASE = process.env.BASE || 'http://localhost:3000';
const LECTURAS = Number(process.env.LECTURAS || 8);
const USUARIOS = [4, 7]; // Juan con conexion sana y Laura con conexion degradada

function espera(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function publicar(usuario_id, metrica, valor, tipo) {
  const r = await fetch(`${BASE}/ingesta/sensor`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ usuario_id, tipo, metrica, valor }),
  });
  const j = await r.json();
  console.log(`enviado usuario ${usuario_id} ${metrica}=${valor} -> ${r.status} ${JSON.stringify(j)}`);
}

async function main() {
  console.log(`Simulando sensores contra ${BASE} ...`);
  for (let i = 0; i < LECTURAS; i++) {
    for (const u of USUARIOS) {
      const temp = Math.round((21 + Math.random() * 6) * 10) / 10;
      const conn = u === 7 ? Math.round(30 + Math.random() * 20) : Math.round(85 + Math.random() * 10);
      await publicar(u, 'temperatura', temp, 'ambiente');
      await publicar(u, 'calidad_conexion', conn, 'conexion');
    }
    await espera(400);
  }
  console.log('Simulacion terminada. El contexto entra como informacion, no afecta el puntaje.');
}

main().catch((e) => {
  console.error('Error en el simulador. El servidor debe estar corriendo (npm start).');
  console.error(e.message);
  process.exit(1);
});
