import React from 'react';
import type { CorrelacionMetricas, EstadoMetricaCorrelacion, MetricaDetalle } from '../../types';
import { ESTADO_CORRELACION, formatearValor, ordenarCorrelaciones } from '../../utils/analitica';

type MetricasPorNombre = Map<string, MetricaDetalle>;

// Línea pequeña de una de las dos series de la correlación, con su valor habitual punteado. Los valores son los crudos de
// los periodos con los que se calculó el coeficiente, así que la gráfica coincide con el diagnóstico.
const Linea: React.FC<{ valores: number[]; habitual: number | null | undefined; color: string }> = ({
  valores,
  habitual,
  color,
}) => {
  if (valores.length === 0) return <svg viewBox="0 0 240 90" className="an-spark" aria-hidden="true" />;
  const todos = habitual == null ? valores : [...valores, habitual];
  let lo = Math.min(...todos);
  let hi = Math.max(...todos);
  if (hi === lo) {
    hi += 1;
    lo -= 1;
  }
  const X = (i: number) => 6 + (valores.length > 1 ? i / (valores.length - 1) : 1) * 228;
  const Y = (v: number) => 8 + 74 * (1 - (v - lo) / (hi - lo));
  const ult = valores.length - 1;
  return (
    <svg viewBox="0 0 240 90" className="an-spark" preserveAspectRatio="none" aria-hidden="true">
      {habitual != null && (
        <line x1={6} x2={234} y1={Y(habitual)} y2={Y(habitual)} stroke="var(--line)" strokeDasharray="3 3" />
      )}
      <polyline
        fill="none"
        stroke={color}
        strokeWidth={2}
        points={valores.map((v, i) => `${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(' ')}
      />
      <circle cx={X(ult)} cy={Y(valores[ult])} r={3.5} fill={color} />
    </svg>
  );
};

const Encabezado: React.FC<{ metrica: MetricaDetalle | undefined; nombre: string; est: EstadoMetricaCorrelacion | null }> = ({
  metrica,
  nombre,
  est,
}) => (
  <div className="an-corr-hd">
    {metrica?.nombre ?? nombre}
    {est && metrica && (
      <>
        {' '}
        <b>{formatearValor(metrica, est.valor)}</b>
        {est.habitual != null && <span className="an-mut"> · habitual {formatearValor(metrica, est.habitual)}</span>}
      </>
    )}
  </div>
);

const TarjetaCorrelacion: React.FC<{ c: CorrelacionMetricas; metricas: MetricasPorNombre }> = ({ c, metricas }) => {
  // Un estado que este frontend no conoce se muestra tal cual y sin énfasis, en vez de romper la tarjeta.
  const e = ESTADO_CORRELACION[c.estado] ?? { texto: String(c.estado), clase: 'tenue' };
  const serie = c.serie ?? [];
  const ma = metricas.get(c.metrica_a);
  const mb = metricas.get(c.metrica_b);
  return (
    <div className="an-corr">
      <div className="an-corr-ctx">
        <span>
          {c.dimension_a} × {c.dimension_b} · {c.contexto}
        </span>
        <span className={`an-est ${e.clase}`}>{e.texto}</span>
      </div>
      <p className={`an-corr-msg${c.estado === 'diagnostico' ? '' : ' sin'}`}>{c.mensaje}</p>
      <div className="an-corr-dos">
        <div>
          <Encabezado metrica={ma} nombre={c.metrica_a} est={c.a} />
          <Linea valores={serie.map((s) => s[1])} habitual={c.a?.habitual} color="var(--amber)" />
        </div>
        <div>
          <Encabezado metrica={mb} nombre={c.metrica_b} est={c.b} />
          <Linea valores={serie.map((s) => s[2])} habitual={c.b?.habitual} color="var(--blue)" />
        </div>
      </div>
      <div className="an-corr-pie">
        {c.coeficiente != null && (
          <span className="an-mono">
            r = {c.coeficiente.toFixed(2)} · {c.fuerza} · n = {c.n_muestras}
          </span>
        )}
        <span>{c.aviso ?? `${c.n_muestras} ${c.periodo === 'dia' ? 'días' : 'semanas'} con ambas métricas`}</span>
      </div>
    </div>
  );
};

export const Correlaciones: React.FC<{
  filas: CorrelacionMetricas[];
  metricas: MetricasPorNombre;
  vacio: string;
}> = ({ filas, metricas, vacio }) => {
  if (filas.length === 0) return <p className="an-vacio">{vacio}</p>;
  return (
    <div className="an-corrs">
      {ordenarCorrelaciones(filas).map((c) => (
        <TarjetaCorrelacion key={`${c.id}-${c.metrica_a}-${c.metrica_b}`} c={c} metricas={metricas} />
      ))}
    </div>
  );
};
