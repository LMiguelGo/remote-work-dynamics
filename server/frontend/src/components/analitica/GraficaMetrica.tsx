import React, { useMemo, useState } from 'react';
import type { FranjaMetrica, MetricaDetalle, PuntoMetrica } from '../../types';
import { COLOR_ESTADO, ESTADO_TEXTO, fechaCorta, formatearValor, msDe, rangoFechas } from '../../utils/analitica';
import { UNIDAD_DIA_MS, UNIDAD_SEMANA_MS, ejeComprimido } from '../../utils/ejeComprimido';

// Geometría del dibujo (unidades del viewBox): el valor real con franjas de umbral y, debajo, las fechas.
const VW = 520;
const VH = 178;
const PL = 46;
const PR = 10;
const MT = 12;
const MH = 140;
const DIA_MS = 86400000;
// Un periodo sin muestras se comprime desde 5 días entre muestras (un fin de semana largo no cuenta) o 3 semanas.
const HUECO_MIN_DIAS = 5;
const HUECO_MIN_SEMANAS = 3;
const ANCHO_HUECO = 30; // ancho de la franja comprimida, de 464 que mide el área de dibujo

interface Props {
  metrica: MetricaDetalle;
  referencia: string; // último día calculado: es donde termina el eje
  dias?: number;
  semanas?: number;
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

export const GraficaMetrica: React.FC<Props> = ({ metrica, referencia }) => {
  const [activo, setActivo] = useState<number | null>(null);
  const semanal = metrica.frecuencia === 'semanal';
  const historial = metrica.historial;

  const g = useMemo(() => {
    const W = VW - PL - PR;
    const centro = (p: PuntoMetrica) => (semanal ? msDe(p.start_date) + 3 * DIA_MS : msDe(p.start_date));
    // El eje va de la primera muestra al día de referencia (o a la última semana). Los periodos largos sin muestras se
    // comprimen en una franja angosta: la gráfica se reparte entre los días que sí tienen datos.
    const conValor = historial.filter((p) => p.raw_value != null);
    const centros = conValor.map(centro);
    const finMs = semanal
      ? Math.max(msDe(referencia) - 3 * DIA_MS, centros.length ? centros[centros.length - 1] : -Infinity)
      : msDe(referencia);
    const eje = ejeComprimido(centros, finMs, {
      x0: PL,
      ancho: W,
      unidadMs: semanal ? UNIDAD_SEMANA_MS : UNIDAD_DIA_MS,
      huecoMinUnidades: semanal ? HUECO_MIN_SEMANAS : HUECO_MIN_DIAS,
      anchoHueco: ANCHO_HUECO,
      maxFraccionHuecos: 0.3,
    });
    const X = eje.X;

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
    const puntosXY = conValor.map((p) => ({ p, x: X(centro(p)), y: Y(p.raw_value as number) }));
    const ancho = eje.anchoUnidad * (semanal ? 5 / 7 : 0.7); // ancho de una barra semanal
    // Fechas del eje: solo en los tramos con datos, una cada semana (diaria) o cada 2 semanas (semanal), sin que se pisen.
    const huecos = eje.tramos.filter((tr) => tr.hueco);
    const candidatas: Array<{ x: number; texto: string }> = [];
    const paso = (semanal ? 14 : 7) * DIA_MS;
    for (const tr of eje.tramos.filter((r) => !r.hueco)) {
      const primero = Math.ceil((tr.t0 - DIA_MS / 2) / DIA_MS) * DIA_MS + DIA_MS / 2;
      for (let t = primero; t <= tr.t1; t += paso) candidatas.push({ x: X(t), texto: fechaCorta(new Date(t).toISOString()) });
    }
    // Cada tramo con datos lleva al menos su primera fecha: si cae pegada a una franja, se alinea junto a su borde.
    for (const tr of eje.tramos.filter((r) => !r.hueco)) {
      const primera = conValor.find((p) => centro(p) >= tr.t0 && centro(p) <= tr.t1);
      if (primera) candidatas.push({ x: X(centro(primera)), texto: fechaCorta(primera.start_date) });
    }
    const ticks: Array<{ x: number; texto: string; ancla: 'start' | 'middle' | 'end' }> = [];
    for (const c of candidatas.sort((a, b) => a.x - b.x)) {
      const despues = huecos.find((h) => c.x >= h.x1 && c.x < h.x1 + 18);
      const antes = huecos.find((h) => c.x <= h.x0 && c.x > h.x0 - 18);
      const t = despues
        ? { ...c, x: despues.x1 + 2, ancla: 'start' as const }
        : antes
          ? { ...c, x: antes.x0 - 2, ancla: 'end' as const }
          : c.x > PL + W - 16
            ? { ...c, ancla: 'end' as const } // pegada al borde derecho: no se corta
            : { ...c, ancla: 'middle' as const };
      const previo = ticks[ticks.length - 1];
      const lejosDelAnterior = !previo || t.x - previo.x >= 44 || (previo.ancla === 'end' && t.ancla === 'start');
      if (lejosDelAnterior && !ticks.some((k) => k.texto === t.texto)) ticks.push(t);
    }
    return {
      W,
      Y,
      franjas,
      puntosXY,
      huecos,
      ancho: Math.max(2.6, ancho),
      ticks,
      ymin,
      ymax,
      marcas: marcasY(metrica, franjas, ymin, ymax),
    };
  }, [metrica, historial, referencia, semanal]);

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
        <defs>
          <pattern id="an-rayas" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="6" height="6" fill="var(--card)" />
            <line x1="0" y1="0" x2="0" y2="6" stroke="var(--line)" strokeWidth="3" />
          </pattern>
        </defs>
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
        {g.huecos.map((h) => (
          // Periodo sin muestras, comprimido: franja rayada con las dos fechas en vertical.
          <g key={`hueco-${h.desde}`} className="an-hueco">
            <title>{`Sin muestras del ${fechaCorta(h.desde ?? '')} al ${fechaCorta(h.hasta ?? '')}`}</title>
            <rect x={h.x0} y={MT} width={h.x1 - h.x0} height={MH} fill="url(#an-rayas)" />
            <line x1={h.x0} x2={h.x0} y1={MT} y2={MT + MH} stroke="var(--muted)" strokeDasharray="2 2" />
            <line x1={h.x1} x2={h.x1} y1={MT} y2={MT + MH} stroke="var(--muted)" strokeDasharray="2 2" />
            <text
              className="an-hueco-txt"
              transform={`translate(${(h.x0 + h.x1) / 2 + 3}, ${MT + MH / 2}) rotate(-90)`}
              textAnchor="middle"
            >
              {`sin muestras · ${fechaCorta(h.desde ?? '')} – ${fechaCorta(h.hasta ?? '')}`}
            </text>
          </g>
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
            {/* La línea se corta en cada periodo sin muestras: no se inventa una tendencia donde no hubo datos. */}
            {g.puntosXY
              .reduce<Array<typeof g.puntosXY>>((tramos, q, i) => {
                const antes = g.puntosXY[i - 1];
                const cruzaHueco = antes && g.huecos.some((h) => antes.x <= h.x0 && q.x >= h.x1);
                if (!antes || cruzaHueco) tramos.push([q]);
                else tramos[tramos.length - 1].push(q);
                return tramos;
              }, [])
              .map((tramo) => (
                <polyline
                  key={tramo[0].p.start_date}
                  fill="none"
                  stroke="var(--muted)"
                  strokeWidth={1.2}
                  points={tramo.map((q) => `${q.x.toFixed(1)},${q.y.toFixed(1)}`).join(' ')}
                />
              ))}
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
          <text key={t.texto + t.x} className="an-tk" x={t.x} y={VH - 6} textAnchor={t.ancla}>
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
