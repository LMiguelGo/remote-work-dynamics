import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../services/api';
import type {
  AnaliticaPersona,
  BloqueDimension,
  DimensionDetalle,
  MetricaDetalle,
  PuntoDimension,
} from '../../types';
import { SemaphoreChip } from '../SemaphoreChip';
import {
  ESTADO_TEXTO,
  estadoDePuntaje,
  fechaLarga,
  nivelDeEstado,
  rangoFechas,
} from '../../utils/analitica';
import { Correlaciones } from './Correlaciones';
import { LecturaDimensiones } from './LecturaDimensiones';
import { TarjetaMetrica } from './TarjetaMetrica';

type Vista = 'dia' | 'semana';

interface Props {
  // Ruta del backend sin el id ni el final: `${rutaBase}/${personaId}/analitica`.
  rutaBase: string;
  personaId: number;
}

function textoVariacion(v: number | null | undefined, contra: string): string {
  if (v == null) return 'Sin periodo anterior para comparar';
  if (v >= 0.05) return `▲ ${v.toFixed(1)} ${contra}`;
  if (v <= -0.05) return `▼ ${Math.abs(v).toFixed(1)} ${contra}`;
  return `= sin cambio ${contra}`;
}

// Resultado semanal de las métricas diarias: el promedio de la semana de sus puntos diarios.
function promedioSemanal(d: DimensionDetalle): { ultimo: PuntoDimension; variacion: number | null } | null {
  const lista = d.diaria?.promedios_semanales ?? [];
  if (lista.length === 0) return null;
  const ultimo = lista[lista.length - 1];
  const anterior = lista.length > 1 ? lista[lista.length - 2] : null;
  const variacion =
    anterior && ultimo.normalized_score != null && anterior.normalized_score != null
      ? Math.round((ultimo.normalized_score - anterior.normalized_score) * 10) / 10
      : null;
  return { ultimo, variacion };
}

const Puntaje: React.FC<{ punto: PuntoDimension | null }> = ({ punto }) => {
  if (!punto || punto.normalized_score == null) return <span className="an-dim-none">Sin resultado</span>;
  const estado = punto.criticality_status ?? estadoDePuntaje(punto.normalized_score);
  return (
    <span className="an-dim-score">
      <b className={`an-sc ${estado}`}>{punto.normalized_score.toFixed(1)}</b>
      <small> /10</small>
    </span>
  );
};

// Detalle de una persona, pensado para abrirse dentro de su fila en la tabla del equipo. Primero se ven sus cinco dimensiones;
// al elegir una se despliegan sus métricas, una gráfica por cada una, con las correlaciones que la involucran. Todo viene
// calculado por la analítica y leído por el backend: aquí solo se dibuja.
export const DetallePersona: React.FC<Props> = ({ rutaBase, personaId }) => {
  const [vista, setVista] = useState<Vista>('dia');
  const [dimElegida, setDimElegida] = useState<DimensionDetalle['dimension'] | null>(null);
  // La respuesta se guarda con la persona y el intento a los que pertenece: si cambian, la respuesta anterior deja de valer y
  // el panel pasa a "cargando" sin fijar estado dentro del efecto.
  const [intento, setIntento] = useState(0);
  const [resultado, setResultado] = useState<{
    personaId: number;
    intento: number;
    data: AnaliticaPersona | null;
    error: string | null;
  } | null>(null);

  useEffect(() => {
    let vigente = true; // descarta la respuesta de una persona que ya no está a la vista
    api<AnaliticaPersona>(`${rutaBase}/${personaId}/analitica`)
      .then((d) => {
        if (vigente) setResultado({ personaId, intento, data: d, error: null });
      })
      .catch((err: unknown) => {
        // 401 y debe_cambiar_clave ya los resuelve AuthContext.
        if (vigente) {
          setResultado({
            personaId,
            intento,
            data: null,
            error: err instanceof Error ? err.message : 'No se pudo cargar el detalle',
          });
        }
      });
    return () => {
      vigente = false;
    };
  }, [rutaBase, personaId, intento]);

  const listo = resultado != null && resultado.personaId === personaId && resultado.intento === intento;
  const data = listo ? resultado.data : null;
  const error = listo ? resultado.error : null;

  const metricasPorNombre = useMemo(() => {
    const mapa = new Map<string, MetricaDetalle>();
    data?.dimensiones.forEach((d) => d.metricas.forEach((m) => mapa.set(m.metric_name, m)));
    return mapa;
  }, [data]);

  const tieneDatos = useCallback(
    (d: DimensionDetalle) => (vista === 'dia' ? d.diaria != null : d.semanal != null || promedioSemanal(d) != null),
    [vista],
  );
  // La dimensión elegida, solo si tiene datos en esta vista (al cambiar de Día a Semana puede dejar de tenerlos).
  const dimActiva = useMemo(() => {
    const d = data?.dimensiones.find((x) => x.dimension === dimElegida);
    return d && tieneDatos(d) ? d : null;
  }, [data, dimElegida, tieneDatos]);

  if (!listo) return <p className="an-vacio">Cargando el detalle...</p>;

  if (!data) {
    return (
      <div className="an-panel">
        <p className="error">{error ?? 'No se pudo cargar el detalle.'}</p>
        <button className="btn" onClick={() => setIntento((n) => n + 1)}>
          Reintentar
        </button>
      </div>
    );
  }

  if (!data.referencia) {
    return (
      <p className="an-vacio">
        Todavía no hay resultados de analítica para esta persona. Aparecen cuando la analítica procesa su primer día.
      </p>
    );
  }

  const ref = data.referencia;
  const { dias, semanas } = data.ventana;
  const filasCorr = data.correlaciones?.metricas ?? [];

  const alternar = (d: DimensionDetalle) => setDimElegida((actual) => (actual === d.dimension ? null : d.dimension));

  // ---- tarjetas por dimensión ----
  const tarjetaDia = (d: DimensionDetalle) => {
    const b = d.diaria;
    return (
      <button
        key={d.dimension}
        className={`an-dim${dimActiva?.dimension === d.dimension ? ' on' : ''}`}
        disabled={!b}
        aria-pressed={dimActiva?.dimension === d.dimension}
        onClick={() => alternar(d)}
      >
        <span className="an-dim-name">
          {d.dimension} · {d.nombre.split(' ')[0]}
          {b ? (
            <SemaphoreChip
              level={nivelDeEstado(b.ultimo.criticality_status)}
              text={b.ultimo.criticality_status ? ESTADO_TEXTO[b.ultimo.criticality_status] : 'Sin dato'}
            />
          ) : (
            <SemaphoreChip level="none" text="Sin métricas diarias" />
          )}
        </span>
        {b ? (
          <>
            <Puntaje punto={b.ultimo} />
            <span className="an-dim-delta">{textoVariacion(b.variacion, 'frente al día anterior')}</span>
          </>
        ) : (
          <span className="an-dim-delta">Se miden por semana: están en la pestaña Semana.</span>
        )}
      </button>
    );
  };

  const tarjetaSemana = (d: DimensionDetalle) => {
    const p = promedioSemanal(d);
    const s = d.semanal;
    return (
      <button
        key={d.dimension}
        className={`an-dim${dimActiva?.dimension === d.dimension ? ' on' : ''}`}
        disabled={!p && !s}
        aria-pressed={dimActiva?.dimension === d.dimension}
        onClick={() => alternar(d)}
      >
        <span className="an-dim-name">
          {d.dimension} · {d.nombre.split(' ')[0]}
        </span>
        <span className="an-res">
          <span className="an-res-lbl">Diarias · promedio de la semana</span>
          {p ? (
            <>
              <Puntaje punto={p.ultimo} />
              <span className="an-dim-delta">{textoVariacion(p.variacion, 'frente a la semana anterior')}</span>
            </>
          ) : (
            <span className="an-dim-none">Sin métricas diarias</span>
          )}
        </span>
        <span className="an-res">
          <span className="an-res-lbl">Semanales y por sprint</span>
          {s ? (
            <>
              <Puntaje punto={s.ultimo} />
              <span className="an-dim-delta">{textoVariacion(s.variacion, 'frente a la semana anterior')}</span>
            </>
          ) : (
            <span className="an-dim-none">Sin métricas semanales</span>
          )}
        </span>
      </button>
    );
  };

  // ---- detalle de la dimensión elegida: vista del día ----
  const detalleDia = (d: DimensionDetalle, b: BloqueDimension) => {
    const relacionadas = filasCorr.filter((c) => c.periodo === 'dia' && (c.dimension_a === d.dimension || c.dimension_b === d.dimension));
    return (
      <div className="an-detalle">
        <div className="an-dhead">
          <div>
            <h4>
              {d.dimension} · {d.nombre}
            </h4>
            <p>
              Puntaje del día {fechaLarga(b.ultimo.start_date)}
              {b.ultimo.start_date !== ref ? ' (último día con datos de esta dimensión)' : ''}
            </p>
          </div>
          <div className="an-big">
            <Puntaje punto={b.ultimo} />
            <SemaphoreChip
              level={nivelDeEstado(b.ultimo.criticality_status)}
              text={b.ultimo.criticality_status ? ESTADO_TEXTO[b.ultimo.criticality_status] : 'Sin dato'}
            />
          </div>
        </div>
        <p className="an-nota">
          Calculado con las {b.ultimo.metricas_medidas} métricas medidas ese día
          {b.ultimo.metricas_medidas < b.ultimo.metricas_total
            ? ` (de ${b.ultimo.metricas_total}; las que no se midieron no cuentan)`
            : ''}
          .
        </p>
        <div className="an-howto">
          <span>Cada punto es la muestra de un día</span>
          <span>El color es su criticidad</span>
          <span>Las franjas son los umbrales en la unidad de la métrica</span>
          <span>Pasa el cursor, o usa las flechas, para ver el detalle de un día</span>
        </div>
        <div className="an-mgrid">
          {d.metricas
            .filter((m) => m.frecuencia === 'diaria')
            .map((m) => (
              <TarjetaMetrica key={m.metric_name} metrica={m} referencia={ref} dias={dias} semanas={semanas} />
            ))}
        </div>

        <h4 className="an-sec">Qué dicen los datos</h4>
        <p className="an-sec-sub">
          Relaciones entre métricas diarias que involucran a esta dimensión. El diagnóstico aparece solo cuando la relación es
          significativa frente al historial de la persona.
        </p>
        {data.correlaciones ? (
          <Correlaciones filas={relacionadas} metricas={metricasPorNombre} vacio="Esta dimensión no entra en ninguna correlación diaria." />
        ) : (
          <p className="an-vacio">Las correlaciones no están disponibles en este momento.</p>
        )}
      </div>
    );
  };

  // ---- detalle de la dimensión elegida: vista de la semana ----
  const detalleSemana = (d: DimensionDetalle) => {
    const promedio = promedioSemanal(d);
    const base = (d.semanal ?? promedio)!.ultimo;
    const semanales = d.metricas.filter((m) => m.frecuencia === 'semanal');
    const relacionadas = filasCorr.filter((c) => c.periodo === 'semana' && (c.dimension_a === d.dimension || c.dimension_b === d.dimension));
    return (
      <div className="an-detalle">
        <div className="an-dhead">
          <div>
            <h4>
              {d.dimension} · {d.nombre}
            </h4>
            <p>Semana del {rangoFechas(base.start_date, base.end_date)}</p>
          </div>
        </div>
        <div className="an-dos">
          <div>
            <span className="an-res-lbl">Diarias · promedio de la semana</span>
            {promedio ? <Puntaje punto={promedio.ultimo} /> : <span className="an-dim-none">Sin métricas diarias</span>}
          </div>
          <div>
            <span className="an-res-lbl">Semanales y por sprint</span>
            {d.semanal ? <Puntaje punto={d.semanal.ultimo} /> : <span className="an-dim-none">Sin métricas semanales</span>}
          </div>
        </div>
        <p className="an-nota">
          Los dos resultados no se mezclan ni se promedian entre sí: uno resume lo que se mide cada día y el otro lo que se mide una
          vez por semana o sprint.
        </p>
        {semanales.length > 0 ? (
          <div className="an-mgrid">
            {semanales.map((m) => (
              <TarjetaMetrica key={m.metric_name} metrica={m} referencia={ref} dias={dias} semanas={semanas} />
            ))}
          </div>
        ) : (
          <p className="an-vacio">
            Esta dimensión no tiene métricas semanales; su resultado de la semana es el promedio de sus métricas diarias.
          </p>
        )}

        <h4 className="an-sec">Qué dicen los datos de la semana</h4>
        {data.correlaciones ? (
          <Correlaciones filas={relacionadas} metricas={metricasPorNombre} vacio="Esta dimensión no entra en ninguna correlación semanal." />
        ) : (
          <p className="an-vacio">Las correlaciones no están disponibles en este momento.</p>
        )}
      </div>
    );
  };

  return (
    <div className="an-panel">
      <div className="an-bar">
        <p className="an-nota">
          Último día con datos: {fechaLarga(ref)}. Los puntajes van de 0 a 10 y los calcula la analítica; aquí solo se dibujan.
        </p>
        <div className="an-tabs" role="tablist" aria-label="Periodo">
          <button role="tab" aria-selected={vista === 'dia'} className={vista === 'dia' ? 'on' : ''} onClick={() => setVista('dia')}>
            Día
          </button>
          <button role="tab" aria-selected={vista === 'semana'} className={vista === 'semana' ? 'on' : ''} onClick={() => setVista('semana')}>
            Semana
          </button>
        </div>
      </div>

      <h4 className="an-sec">{vista === 'dia' ? 'Estado por dimensión al cierre del día' : 'Resultados de la semana por dimensión'}</h4>
      <p className="an-sec-sub">
        {vista === 'dia'
          ? 'Puntaje de cada dimensión ese día, de 0 a 10. Elige una dimensión para ver una gráfica por cada una de sus métricas diarias.'
          : 'Cada dimensión tiene dos resultados: el promedio de la semana de sus métricas diarias y el de sus métricas semanales o por sprint. Elige una dimensión para ver sus métricas.'}
      </p>
      <div className="an-dims">{data.dimensiones.map(vista === 'dia' ? tarjetaDia : tarjetaSemana)}</div>

      {dimActiva && vista === 'dia' && dimActiva.diaria && detalleDia(dimActiva, dimActiva.diaria)}
      {dimActiva && vista === 'semana' && detalleSemana(dimActiva)}

      <LecturaDimensiones conclusion={data.correlaciones?.conclusion_dimensiones} />
    </div>
  );
};
