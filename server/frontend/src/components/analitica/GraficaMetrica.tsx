import React, { useMemo, useState } from 'react';
import type { FranjaMetrica, MetricaDetalle, PuntoMetrica } from '../../types';
import {
  COLOR_ESTADO,
  ESTADO_TEXTO,
  fechaCorta,
  formatearValor,
  msDe,
  rangoFechas,
  sumarDias,
} from '../../utils/analitica';

// Geometría del dibujo (unidades del viewBox): el valor real con franjas de umbral y, debajo, las fechas.
const VW = 520;
const VH = 178;
const PL = 46;
const PR = 10;
const MT = 12;
const MH = 140;
const DIA_MS = 86400000;

interface Props {
  metrica: MetricaDetalle;
  referencia: string; // último día con datos: es donde termina el eje
  dias: number;
  semanas: number;
}

// Franjas dentro de la escala dibujada. La primera y la última se extienden hasta los bordes si la escala se amplió.
function franjasEnEscala(franjas: FranjaMetrica[], ymin: number, ymax: number): FranjaMetrica[] {
  const ordenadas = [...franjas].sort((a, b) => a.desde - b.desde);
  return ordenadas
    .map((f, i) => ({
      ...f,
      desde: i === 0 ? ymin : Math.max(f.desde, ymin),
      hasta: i === ordenadas.length - 1 ? ymax : Math.min(f.hasta, ymax),
    }))
    .filter((f) => f.hasta > f.desde);
}

// Marcas del eje Y: los bordes de las franjas y los extremos, sin que se pisen las etiquetas.
function marcasY(m: MetricaDetalle, franjas: FranjaMetrica[] | null, ymin: number, ymax: number): number[] {
  if (m.mejor === 'letra') return [1, 2, 3, 4, 5];
  const base = new Set<number>([ymin, ymax]);
  (franjas ?? []).forEach((f) => {
    if (f.desde > ymin && f.desde < ymax) base.add(f.desde);
    if (f.hasta > ymin && f.hasta < ymax) base.add(f.hasta);
  });
  const orden = [...base].sort((a, b) => a - b);
  const separacion = (ymax - ymin) * 0.07;
  const salida: number[] = [];
  for (const v of orden) {
    if (salida.length === 0 || v - salida[salida.length - 1] >= separacion) salida.push(v);
  }
  // el extremo superior siempre se conserva, aunque haya que quitar la marca anterior
  if (salida[salida.length - 1] !== ymax) salida[salida.length - 1] = ymax;
  return salida;
}

function etiquetaMarca(m: MetricaDetalle, v: number): string {
  return m.mejor === 'letra' ? ('EDCBA'[v - 1] ?? '') : String(+v.toFixed(2));
}

export const GraficaMetrica: React.FC<Props> = ({ metrica, referencia, dias, semanas }) => {
  const [activo, setActivo] = useState<number | null>(null);
  const semanal = metrica.frecuencia === 'semanal';
  const historial = metrica.historial;

  const g = useMemo(() => {
    const inicio = semanal ? sumarDias(referencia, -(7 * semanas - 1)) : sumarDias(referencia, -(dias - 1));
    const finSemana = historial.length ? historial[historial.length - 1].end_date : referencia;
    const fin = semanal && finSemana > referencia ? finSemana : referencia;
    const t0 = msDe(inicio) - DIA_MS / 2;
    const t1 = msDe(fin) + DIA_MS / 2;
    const W = VW - PL - PR;
    const centro = (p: PuntoMetrica) => (semanal ? msDe(p.start_date) + 3 * DIA_MS : msDe(p.start_date));
    const X = (t: number) => PL + ((t - t0) / (t1 - t0)) * W;

    const valores = historial.map((p) => p.raw_value).filter((v): v is number => v != null);
    let ymin = metrica.escala?.min ?? 0;
    let ymax = metrica.escala?.max ?? Math.max(1, ...valores) * 1.2;
    if (valores.length) {
      const vmax = Math.max(...valores);
      const vmin = Math.min(...valores);
      if (vmax > ymax) ymax = vmax + (vmax - ymin) * 0.06;
      if (vmin < ymin) ymin = vmin - (ymax - vmin) * 0.06;
    }
    const Y = (v: number) => MT + MH * (1 - (v - ymin) / (ymax - ymin));
    const franjas = metrica.franjas ? franjasEnEscala(metrica.franjas, ymin, ymax) : null;
    const dibujable = historial.filter((p) => p.raw_value != null);
    const puntosXY = dibujable.map((p) => ({ p, x: X(centro(p)), y: Y(p.raw_value as number) }));
    const ancho = (W / ((t1 - t0) / DIA_MS)) * 5; // ancho de una barra semanal
    const ticks: Array<{ x: number; texto: string }> = [];
    for (let t = msDe(inicio); t <= t1; t += 14 * DIA_MS) {
      ticks.push({ x: X(t), texto: fechaCorta(new Date(t).toISOString()) });
    }
    return { W, Y, franjas, puntosXY, ancho: Math.max(2.6, ancho), ticks, ymin, ymax, marcas: marcasY(metrica, franjas, ymin, ymax) };
  }, [metrica, historial, referencia, dias, semanas, semanal]);

  if (g.puntosXY.length === 0) {
    return <p className="an-vacio">Todavía no hay muestras de esta métrica. No se muestra como cero: aún no se ha medido.</p>;
  }

  const ultimo = g.puntosXY.length - 1;
  const sel = activo != null ? Math.min(activo, ultimo) : null;
  const elegido = sel != null ? g.puntosXY[sel] : null;

  const alMover = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const sx = ((e.clientX - r.left) * VW) / r.width;
    let mejor = 0;
    g.puntosXY.forEach((q, i) => {
      if (Math.abs(q.x - sx) < Math.abs(g.puntosXY[mejor].x - sx)) mejor = i;
    });
    setActivo(mejor);
  };

  const alTeclear = (e: React.KeyboardEvent<SVGSVGElement>) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const actual = sel ?? ultimo;
    setActivo(Math.max(0, Math.min(ultimo, actual + (e.key === 'ArrowLeft' ? -1 : 1))));
  };

  const descripcion = `${metrica.nombre}: ${g.puntosXY.length} ${semanal ? 'semanas' : 'días'} con datos. Último valor ${formatearValor(
    metrica,
    g.puntosXY[ultimo].p.raw_value,
  )}.`;
  const barraY = (v: number) => g.Y(v);

  return (
    <div className="an-chart">
      <svg
        viewBox={`0 0 ${VW} ${VH}`}
        role="img"
        aria-label={descripcion}
        tabIndex={0}
        onPointerMove={alMover}
        onPointerLeave={() => setActivo(null)}
        onKeyDown={alTeclear}
        onBlur={() => setActivo(null)}
      >
        {g.franjas?.map((f, i) => (
          <rect
            key={i}
            x={PL}
            y={g.Y(f.hasta)}
            width={g.W}
            height={g.Y(f.desde) - g.Y(f.hasta)}
            fill={COLOR_ESTADO[f.estado]}
            fillOpacity={f.estado === 'precaucion' ? 0.16 : 0.1}
          />
        ))}
        <line x1={PL} y1={MT} x2={PL} y2={MT + MH} stroke="var(--line)" />
        {g.marcas.map((v) => (
          <text key={v} className="an-tk" x={PL - 6} y={g.Y(v) + 3.5} textAnchor="end">
            {etiquetaMarca(metrica, v)}
          </text>
        ))}

        {semanal ? (
          g.puntosXY.map((q) => (
            <rect
              key={q.p.start_date}
              x={q.x - g.ancho / 2}
              y={Math.min(barraY(q.p.raw_value as number), barraY(Math.max(g.ymin, 0)))}
              width={g.ancho}
              height={Math.abs(barraY(Math.max(g.ymin, 0)) - barraY(q.p.raw_value as number))}
              fill={q.p.criticality ? COLOR_ESTADO[q.p.criticality] : 'var(--muted)'}
            />
          ))
        ) : (
          <>
            <polyline
              fill="none"
              stroke="var(--muted)"
              strokeWidth={1.2}
              points={g.puntosXY.map((q) => `${q.x.toFixed(1)},${q.y.toFixed(1)}`).join(' ')}
            />
            {g.puntosXY.map((q, i) => (
              <circle
                key={q.p.start_date}
                cx={q.x}
                cy={q.y}
                r={i === ultimo ? 5 : 3.2}
                fill={q.p.criticality ? COLOR_ESTADO[q.p.criticality] : 'var(--muted)'}
                stroke={i === ultimo ? 'var(--ink)' : '#fff'}
                strokeWidth={i === ultimo ? 1.6 : 1}
              />
            ))}
          </>
        )}

        {g.ticks.map((t) => (
          <text key={t.texto + t.x} className="an-tk" x={t.x} y={VH - 6} textAnchor="middle">
            {t.texto}
          </text>
        ))}

        {elegido && (
          <>
            <line
              x1={elegido.x}
              x2={elegido.x}
              y1={MT}
              y2={MT + MH}
              stroke="var(--ink2)"
              strokeDasharray="3 2"
            />
            <circle cx={elegido.x} cy={elegido.y} r={7} fill="none" stroke="var(--ink)" strokeWidth={1.8} />
          </>
        )}
      </svg>

      {elegido && (
        <div
          className="an-tip"
          role="status"
          style={{
            left: `${(elegido.x / VW) * 100}%`,
            transform: elegido.x > VW * 0.55 ? 'translateX(calc(-100% - 12px))' : 'translateX(12px)',
          }}
        >
          <b>{semanal ? rangoFechas(elegido.p.start_date, elegido.p.end_date) : rangoFechas(elegido.p.start_date, elegido.p.start_date)}</b>
          <br />
          {formatearValor(metrica, elegido.p.raw_value)}
          {elegido.p.criticality && (
            <>
              {' · '}
              <span style={{ color: COLOR_ESTADO[elegido.p.criticality] }}>●</span>{' '}
              {ESTADO_TEXTO[elegido.p.criticality]}
            </>
          )}
        </div>
      )}
    </div>
  );
};
