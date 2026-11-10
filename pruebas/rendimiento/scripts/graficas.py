"""Figuras 1 y 2 de la Actividad 5 a partir de los resultados del 2026-11-09.
Uso: python scripts/graficas.py   (lee ../resultados/ y escribe en ../figuras/)
"""
import csv
import json
import statistics as st
from datetime import datetime, timezone
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.ticker import FuncFormatter

AQUI = Path(__file__).resolve().parent
RES = AQUI.parent / "resultados"
SALIDA = AQUI.parent / "figuras"
SALIDA.mkdir(parents=True, exist_ok=True)

AZUL, NARANJA, GRIS = "#2a78d6", "#eb6834", "#a3a29b"
TINTA, TINTA2, REJILLA = "#1f1f1d", "#5f5e58", "#e6e5e0"
plt.rcParams.update({
    "font.family": "serif", "font.serif": ["Times New Roman", "DejaVu Serif"],
    "font.size": 9, "axes.edgecolor": TINTA2, "axes.labelcolor": TINTA, "xtick.color": TINTA2,
    "ytick.color": TINTA2, "axes.spines.top": False, "axes.spines.right": False,
    "axes.grid": True, "grid.color": REJILLA, "grid.linewidth": 0.6, "axes.axisbelow": True,
    "legend.frameon": False, "savefig.dpi": 300,
})

datos = json.loads((RES / "resultados_2026-11-09.json").read_text(encoding="utf-8"))
mqtt, api = datos["mqtt"], datos["api"]


def ms_fmt(v, _):
    return f"{v/1000:g} s" if v >= 1000 else f"{v:g} ms"


# ---------------- Figura 1: latencia por escenario ----------------
fig, (a, b) = plt.subplots(1, 2, figsize=(6.5, 2.9), gridspec_kw={"wspace": 0.32})
x = range(len(mqtt))
etq = [f"{m['tasa_msg_s']}\n({m['dispositivos_equiv']})" for m in mqtt]
a.plot(x, [m["lat_ms_p50"] for m in mqtt], color=AZUL, lw=2, marker="o", ms=4.5, label="Mediana")
a.plot(x, [m["lat_ms_p95"] for m in mqtt], color=NARANJA, lw=2, marker="s", ms=4.5, label="Percentil 95")
a.set_yscale("log")
a.yaxis.set_major_formatter(FuncFormatter(ms_fmt))
a.set_xticks(list(x), etq)
a.set_xlabel("Mensajes/s (ESP32 equivalentes)")
a.set_ylabel("Latencia sensor → base de datos")
a.set_title("(a) Ingesta MQTT", loc="left", fontsize=9.5, color=TINTA)
a.annotate("cola: el backend\nprocesa 251 ev/s", xy=(4, mqtt[4]["lat_ms_p50"]), xytext=(0.05, 1500),
           fontsize=7.5, color=TINTA2, arrowprops=dict(arrowstyle="-", color=TINTA2, lw=0.6))

u = [r["usuarios"] for r in api]
xb = range(len(u))
b.plot(xb, [r["p50_ms"] / 1000 for r in api], color=AZUL, lw=2, marker="o", ms=4.5, label="Mediana")
b.plot(xb, [r["p95_ms"] / 1000 for r in api], color=NARANJA, lw=2, marker="s", ms=4.5, label="Percentil 95")
for meta, texto in ((3, "Meta p95 consultas: 3 s"), (5, "Meta p95 agregaciones: 5 s")):
    b.axhline(meta, color=TINTA2, lw=0.9, ls=(0, (4, 3)))
    b.text(-0.15, meta + 0.12, texto, fontsize=7.5, color=TINTA2)
b.set_xticks(list(xb), [str(n) for n in u])
b.set_ylim(0, 6.5)
b.yaxis.set_major_formatter(FuncFormatter(lambda v, _: f"{v:g} s"))
b.set_xlabel("Usuarios concurrentes")
b.set_ylabel("Tiempo de respuesta de la API")
b.set_title("(b) API a través de nginx", loc="left", fontsize=9.5, color=TINTA)
h, l = a.get_legend_handles_labels()
fig.legend(h, l, loc="upper center", ncol=2, bbox_to_anchor=(0.5, 1.03), fontsize=8.5)
fig.savefig(SALIDA / "fig1_latencia_por_escenario.pdf", bbox_inches="tight")
fig.savefig(SALIDA / "fig1_latencia_por_escenario.png", bbox_inches="tight")
plt.close(fig)

# ---------------- Figura 2: CPU y memoria por contenedor ----------------
def epoch(iso):
    return datetime.fromisoformat(iso.replace("Z", "+00:00")).timestamp()


def mib(s):
    v = s.split("/")[0].strip()
    n, uni = float(v[:-3]), v[-3:]
    return n * 1024 if uni == "GiB" else n / 1024 if uni == "KiB" else n


def leer(nombre):
    return list(csv.DictReader(open(RES / nombre, encoding="utf-8")))


def tramo(filas, a=None, b=None):
    sel = [r for r in filas if (a is None or a <= int(r["ts"]) <= b)]
    out = {}
    for grupo, nombres in (("backend", ["backend"]), ("database", ["database"]),
                           ("otros", ["analytics", "broker-mqtt", "frontend"])):
        cpu, mem = {}, {}
        for r in sel:
            if r["name"] in nombres:
                cpu[r["ts"]] = cpu.get(r["ts"], 0) + float(r["cpu"].rstrip("%"))
                mem[r["ts"]] = mem.get(r["ts"], 0) + mib(r["mem"])
        out[grupo] = (st.median(cpu.values()) / 4, st.median(mem.values()))  # % de 4 vCPU, MiB
    # total = mediana de la suma por instante (es el valor que va en el cuadro 2)
    tot_cpu, tot_mem = {}, {}
    for r in sel:
        tot_cpu[r["ts"]] = tot_cpu.get(r["ts"], 0) + float(r["cpu"].rstrip("%"))
        tot_mem[r["ts"]] = tot_mem.get(r["ts"], 0) + mib(r["mem"])
    out["total"] = (st.median(tot_cpu.values()) / 4, st.median(tot_mem.values()))
    return out


esc = [("Reposo", tramo(leer("stats_reposo.csv")))]
filas = leer("stats_mqtt.csv")
for m in mqtt:
    esc.append((f"{m['tasa_msg_s']}", tramo(filas, epoch(m["inicio"]), epoch(m["fin"]))))
json.dump({n: v for n, v in esc}, open(RES / "recursos_por_escenario.json", "w", encoding="utf-8"), indent=1)

fig, (a, b) = plt.subplots(1, 2, figsize=(6.5, 2.9), gridspec_kw={"wspace": 0.3})
grupos = [("backend", "backend (incluye el simulador)", AZUL), ("database", "base de datos", NARANJA), ("otros", "otros (broker, analítica, frontend)", GRIS)]
xs = range(len(esc))
for eje, k, unidad in ((a, 0, "%"), (b, 1, "MiB")):
    base = [0] * len(esc)
    for clave, nombre, color in grupos:
        vals = [e[1][clave][k] for e in esc]
        eje.bar(xs, vals, bottom=base, color=color, width=0.62, edgecolor="white", linewidth=1, label=nombre)
        base = [p + v for p, v in zip(base, vals)]
    for i, alto in enumerate(base):
        tot = esc[i][1]["total"][k]
        txt = f"{int(round(tot * 10, 6) + 0.5) / 10:.1f}" if k == 0 else f"{tot:.0f}"
        eje.text(i, alto, txt.replace(".", ","), ha="center", va="bottom", fontsize=7.5, color=TINTA)
    eje.set_xticks(list(xs), [e[0] for e in esc])
    eje.set_xlabel("Mensajes/s publicados")
    eje.grid(axis="x", visible=False)
a.set_ylabel("CPU (% de 4 vCPU, mediana)")
a.yaxis.set_major_formatter(FuncFormatter(lambda v, _: f"{v:g} %"))
a.set_title("(a) Uso de CPU", loc="left", fontsize=9.5, color=TINTA)
b.set_ylabel("Memoria (MiB, mediana)")
b.set_title("(b) Uso de memoria", loc="left", fontsize=9.5, color=TINTA)
h, l = a.get_legend_handles_labels()
fig.legend(h, l, loc="upper center", ncol=3, bbox_to_anchor=(0.5, 1.03), fontsize=8.5)
fig.savefig(SALIDA / "fig2_recursos_bajo_carga.pdf", bbox_inches="tight")
fig.savefig(SALIDA / "fig2_recursos_bajo_carga.png", bbox_inches="tight")
plt.close(fig)
for n, v in esc:
    print(n, {g: (round(c, 1), round(m, 0)) for g, (c, m) in v.items()})
print("ok", SALIDA)
