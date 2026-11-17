import React from 'react';
import type { CorrelacionMetricas, EstadoMetricaCorrelacion, ExplicacionCorrelacion, MetricaDetalle } from '../../types';
import { ESTADO_CORRELACION, FUERZA_CORRELACION, formatearValor, ordenarCorrelaciones } from '../../utils/analitica';

type MetricasPorNombre = Map<string, MetricaDetalle>;

// Nombre de la métrica y su valor del último periodo, para el texto al pasar el cursor por la parte subrayada.
function rotulo(metrica: MetricaDetalle | undefined, nombre: string, est: EstadoMetricaCorrelacion | null): string {
  const base = metrica?.nombre ?? nombre;
  if (!est || !metrica) return base;
  const habitual = est.habitual != null ? ` · habitual ${formatearValor(metrica, est.habitual)}` : '';
  return `${base}: ${formatearValor(metrica, est.valor)}${habitual}`;
}

interface Marca {
  texto: string;
  titulo: string;
}

// Parte el mensaje para subrayar el texto que nombra cada métrica (la analítica dice cuál es en `marcas`). Si una marca
// no aparece o se cruza con la otra, el mensaje se muestra sin ese subrayado en vez de romperse.
function mensajeConMarcas(mensaje: string, marcas: Marca[]): React.ReactNode[] {
  const tramos: { ini: number; fin: number; titulo: string }[] = [];
  for (const m of marcas) {
    if (!m.texto) continue;
    const ini = mensaje.indexOf(m.texto);
    const fin = ini + m.texto.length;
    if (ini < 0 || tramos.some((t) => ini < t.fin && t.ini < fin)) continue;
    tramos.push({ ini, fin, titulo: m.titulo });
  }
  tramos.sort((x, y) => x.ini - y.ini);
  const partes: React.ReactNode[] = [];
  let pos = 0;
  for (const t of tramos) {
    if (t.ini > pos) partes.push(mensaje.slice(pos, t.ini));
    partes.push(
      <span key={t.ini} className="an-corr-met" title={t.titulo}>
        {mensaje.slice(t.ini, t.fin)}
      </span>,
    );
    pos = t.fin;
  }
  if (pos < mensaje.length) partes.push(mensaje.slice(pos));
  return partes;
}

// Recuadro con la técnica detrás de la relación (qué se compara, cálculo, confianza y lo esperado). Aparece al pasar el
// puntero por el mensaje o al enfocarlo con el teclado.
const ExplicacionTecnica: React.FC<{ e: ExplicacionCorrelacion; id: string }> = ({ e, id }) => (
  <div className="an-corr-tec" role="tooltip" id={id}>
    <div className="an-corr-tec-tit">Cómo se obtuvo</div>
    <p>{e.compara}</p>
    {e.calculo && (
      <p>
        <b>Cálculo:</b> {e.calculo}
      </p>
    )}
    <p>
      <b>Confianza:</b> {e.confianza}
    </p>
    <p>{e.esperado}</p>
  </div>
);

const TarjetaCorrelacion: React.FC<{ c: CorrelacionMetricas; metricas: MetricasPorNombre }> = ({ c, metricas }) => {
  const tecId = React.useId();
  // Un estado que este frontend no conoce se muestra tal cual y sin énfasis, en vez de romper la tarjeta.
  const e = ESTADO_CORRELACION[c.estado] ?? { texto: String(c.estado), clase: 'tenue' };
  const ma = metricas.get(c.metrica_a);
  const mb = metricas.get(c.metrica_b);
  const periodos = `${c.n_muestras} ${c.periodo === 'dia' ? (c.n_muestras === 1 ? 'día' : 'días') : c.n_muestras === 1 ? 'semana' : 'semanas'}`;
  const partes = mensajeConMarcas(c.mensaje, [
    { texto: c.marcas?.a ?? '', titulo: rotulo(ma, c.metrica_a, c.a) },
    { texto: c.marcas?.b ?? '', titulo: rotulo(mb, c.metrica_b, c.b) },
  ]);
  return (
    <div className="an-corr">
      <div className="an-corr-ctx">
        <span title={`Dimensiones ${c.dimension_a} y ${c.dimension_b}`}>{c.contexto}</span>
        <span className={`an-est ${e.clase}`}>{e.texto}</span>
      </div>
      <div
        className={`an-corr-zona${c.explicacion ? ' con-tec' : ''}`}
        tabIndex={c.explicacion ? 0 : undefined}
        aria-describedby={c.explicacion ? tecId : undefined}
      >
        <p className={`an-corr-msg${c.estado === 'diagnostico' ? '' : ' sin'}`}>{partes}</p>
        {c.explicacion && <ExplicacionTecnica e={c.explicacion} id={tecId} />}
      </div>
      <div className="an-corr-pie">
        {c.coeficiente != null && (
          // El coeficiente y la prueba están en el recuadro "Cómo se obtuvo"; aquí solo la frase.
          <span>
            {FUERZA_CORRELACION[c.fuerza] ?? 'Relación'} · basada en {periodos}
          </span>
        )}
        <span>{c.aviso ?? (c.coeficiente == null ? `${periodos} con ambas medidas` : null)}</span>
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
