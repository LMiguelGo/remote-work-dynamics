import React, { useState, useEffect, useCallback } from 'react';
import { Users, BarChart3, ChevronDown, Wifi } from 'lucide-react';
import { api } from '../services/api';
import {
  DIMN,
  ORDEN_DIMENSIONES,
  type DimensionAnalisis,
  type DimensionKey,
  type DimensionesMap,
  type EquipoLiderData,
  type IntegranteLider,
  type RespuestaConectividad,
  type SemaphoreLevel,
} from '../types';
import { PageHead } from '../components/PageHead';
import { SemaphoreChip } from '../components/SemaphoreChip';
import { RadarChart } from '../components/charts/RadarChart';
import { TablaConectividad } from '../components/TablaConectividad';
import { iniciales, nombreUsuario } from '../utils/helpers';

// La criticidad la calcula la analítica; aquí solo se traduce a color.
function nivelCriticidad(estado: string | null | undefined): SemaphoreLevel {
  switch (estado) {
    case 'optimo':
      return 'ok';
    case 'precaucion':
      return 'warn';
    case 'critico':
      return 'bad';
    default:
      return 'none';
  }
}

// Escala 0-10 con un decimal; null significa "sin dato", nunca 0.
function fmt(v: number | null | undefined): string {
  return v == null ? '—' : v.toFixed(1);
}

function dimensionDe(i: IntegranteLider, d: DimensionKey): DimensionAnalisis | undefined {
  return i.dimensiones.find((x) => x.dimension === d);
}

// El backend entrega fechas de calendario (sin hora). Se toma el día tal cual viene
// para que la zona horaria del navegador no lo corra un día atrás.
function fmtFecha(f: string | null | undefined): string {
  const m = f?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : (f ?? '');
}

export const LiderView: React.FC = () => {
  const [data, setData] = useState<EquipoLiderData | null>(null);
  const [conectividad, setConectividad] = useState<RespuestaConectividad | null>(null);
  const [errorConectividad, setErrorConectividad] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [abiertas, setAbiertas] = useState<Record<number, boolean>>({});

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const [equipo, red] = await Promise.allSettled([
        api<EquipoLiderData>('/api/equipo'),
        api<RespuestaConectividad>('/api/equipo/conectividad'),
      ]);
      if (equipo.status === 'rejected') throw equipo.reason;
      setData(equipo.value);
      setError(null);
      // La conectividad es secundaria: si falla, el resto del tablero se muestra igual.
      if (red.status === 'fulfilled') {
        setConectividad(red.value);
        setErrorConectividad(null);
      } else {
        setConectividad(null);
        setErrorConectividad(
          red.reason instanceof Error ? red.reason.message : 'No se pudo cargar la conectividad',
        );
      }
    } catch (err) {
      // 401 y debe_cambiar_clave ya los resuelve AuthContext.
      setError(err instanceof Error ? err.message : 'No se pudo cargar el equipo');
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  if (cargando) {
    return (
      <div className="page">
        <p className="lead">Cargando equipo...</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="page">
        <p className="error">{error ?? 'No se pudo cargar el equipo.'}</p>
        <button className="btn" onClick={() => void cargar()}>
          Reintentar
        </button>
      </div>
    );
  }

  const integrantes = data.integrantes ?? [];
  const agregado = data.equipo?.agregado ?? null;

  // Radar: el backend manda una lista; el gráfico espera un mapa por dimensión.
  const mapaAgregado = {} as DimensionesMap;
  for (const d of ORDEN_DIMENSIONES) {
    mapaAgregado[d] = agregado?.find((a) => a.dimension === d)?.normalized_score ?? 0;
  }

  const conDatos = (i: IntegranteLider) => i.dimensiones.filter((d) => d.normalized_score != null);
  const integrantesConAnalitica = integrantes.filter((i) => conDatos(i).length > 0).length;
  const criticos = (i: IntegranteLider) =>
    i.dimensiones.filter((d) => d.criticality_status === 'critico').length;
  const totalCriticos = integrantes.reduce((acc, i) => acc + criticos(i), 0);

  // Periodo de referencia: el de la primera dimensión que traiga fechas.
  const periodo = integrantes
    .flatMap((i) => i.dimensiones)
    .find((d) => d.periodo?.start_date && d.periodo?.end_date)?.periodo;

  const alternar = (id: number) => setAbiertas((prev) => ({ ...prev, [id]: !prev[id] }));

  return (
    <div className="page">
      <PageHead
        title="Mi equipo"
        subtitle="Vista de líder. Resultados de cada integrante y del equipo."
        pill="Líder de equipo"
      />

      <div className="grid">
        {/* Card 1: Resumen */}
        <div className="card" style={{ '--i': 0 } as React.CSSProperties}>
          <div className="card-head">
            <div className="icon-chip">
              <Users size={22} />
            </div>
            <div>
              <h3 className="card-title">Resumen del equipo</h3>
            </div>
            <div className="card-tag">Semana</div>
          </div>
          <div className="stats">
            <div className="stat">
              <div className="k">Integrantes</div>
              <div className="v">{integrantes.length}</div>
            </div>
            <div className="stat">
              <div className="k">Con analítica</div>
              <div className="v">{integrantesConAnalitica}</div>
            </div>
            <div className="stat">
              <div className="k">Dimensiones críticas</div>
              <div className="v">{totalCriticos}</div>
            </div>
          </div>
          <div className="card-foot">
            {periodo
              ? `Periodo: ${fmtFecha(periodo.start_date)} al ${fmtFecha(periodo.end_date)}. `
              : ''}
            Apoya tu decisión, no decide por ti.
          </div>
        </div>

        {/* Card 2: Radar SPACE */}
        <div className="card" style={{ '--i': 1 } as React.CSSProperties}>
          <div className="card-head">
            <div className="icon-chip">
              <BarChart3 size={22} />
            </div>
            <div>
              <h3 className="card-title">Métricas agregadas</h3>
              <div className="card-sub">Perfil SPACE del equipo</div>
            </div>
            <div className="card-tag">SPACE</div>
          </div>
          {agregado ? (
            <>
              <RadarChart agregadoDimensiones={mapaAgregado} max={10} />
              <div className="card-foot">
                Promedio del equipo por dimensión, de 0 a 10. Las dimensiones sin datos se dibujan
                en 0.
              </div>
            </>
          ) : (
            <p className="lead">
              Todavía no hay resultados de analítica para tu equipo. Aparecen cuando la analítica
              procesa la semana.
            </p>
          )}
        </div>

        {/* Card 3: Tabla del equipo */}
        <div className="card span2" id="card-actividad" style={{ '--i': 2 } as React.CSSProperties}>
          <div className="card-head">
            <div className="icon-chip">
              <Users size={22} />
            </div>
            <div>
              <h3 className="card-title">Actividad general del equipo</h3>
              <div className="card-sub">
                Toca una fila para ver el desglose. El color lo define la analítica.
              </div>
            </div>
          </div>

          {integrantes.length === 0 ? (
            <p className="lead">No tienes integrantes asignados a tu equipo.</p>
          ) : (
            <div className="tablewrap">
              <table className="tabla">
                <thead>
                  <tr>
                    <th>Integrante</th>
                    {ORDEN_DIMENSIONES.map((d) => (
                      <th key={d} title={DIMN[d]}>
                        {d}
                      </th>
                    ))}
                    <th>Revisar</th>
                  </tr>
                </thead>
                <tbody>
                  {integrantes.map((i) => {
                    const id = i.usuario.id;
                    const abierta = !!abiertas[id];
                    const nCriticos = criticos(i);
                    const nombre = nombreUsuario(i.usuario);
                    return (
                      <React.Fragment key={id}>
                        <tr
                          className={`filarow ${abierta ? 'open' : ''}`}
                          onClick={() => alternar(id)}
                        >
                          <td>
                            <div className="idcell">
                              <span className="ava sm">{iniciales(nombre)}</span>
                              <div>
                                <b>{nombre}</b>
                                <span>{i.usuario.username}</span>
                              </div>
                            </div>
                          </td>
                          {ORDEN_DIMENSIONES.map((d) => {
                            const dim = dimensionDe(i, d);
                            return (
                              <td key={d} className="numcell">
                                <SemaphoreChip
                                  level={nivelCriticidad(dim?.criticality_status)}
                                  text={fmt(dim?.normalized_score)}
                                />
                              </td>
                            );
                          })}
                          <td className="numcell">
                            {nCriticos > 0 ? (
                              <span className="chip warn">{nCriticos}</span>
                            ) : (
                              <span className="chip ok">0</span>
                            )}
                            <span className="chev">
                              <ChevronDown size={16} />
                            </span>
                          </td>
                        </tr>
                        {abierta && (
                          <tr className="filadetail">
                            <td colSpan={7}>
                              <div className="dims">
                                {ORDEN_DIMENSIONES.map((d) => {
                                  const dim = dimensionDe(i, d);
                                  const v = dim?.normalized_score;
                                  return (
                                    <div key={d} className="dim">
                                      <span className="lbl">{DIMN[d]}</span>
                                      <span className="track">
                                        <span
                                          className="fill"
                                          style={{
                                            width: `${Math.min(100, Math.max(0, (v ?? 0) * 10))}%`,
                                          }}
                                        />
                                      </span>
                                      <span className="num">{fmt(v)}</span>
                                    </div>
                                  );
                                })}
                              </div>
                              {i.dimensiones
                                .filter((d) => d.metricas.length > 0)
                                .map((d) => (
                                  <div key={d.dimension} style={{ marginTop: 12 }}>
                                    <div className="section-label">
                                      {DIMN[d.dimension]} · métricas
                                    </div>
                                    <ul>
                                      {d.metricas.map((m) => (
                                        <li key={m.metric_name}>
                                          <b>{m.metric_name}</b>: {fmt(m.raw_value)} (puntaje{' '}
                                          {fmt(m.normalized_value)}){' '}
                                          <SemaphoreChip level={nivelCriticidad(m.criticality)} />
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                ))}
                              <div className="ctx">
                                Cobertura: {conDatos(i).length}/5 dimensiones con datos. Una
                                dimensión sin dato no es un cero: todavía no se ha medido.
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="leyenda">
            <SemaphoreChip level="ok" text="Óptimo (8 a 10)" />{' '}
            <SemaphoreChip level="warn" text="Precaución (6 a 7,9)" />{' '}
            <SemaphoreChip level="bad" text="Crítico (menos de 6)" />{' '}
            <SemaphoreChip level="none" text="Sin dato" />
          </div>
        </div>

        {/* Card 4: Conectividad del equipo */}
        <div
          className="card span2"
          id="card-conectividad"
          style={{ '--i': 3 } as React.CSSProperties}
        >
          <div className="card-head">
            <div className="icon-chip">
              <Wifi size={22} />
            </div>
            <div>
              <h3 className="card-title">Conectividad del equipo</h3>
              <div className="card-sub">
                Última medición de red por integrante. Solo lectura.
              </div>
            </div>
            <div className="card-tag">Red</div>
          </div>
          {errorConectividad ? (
            <p className="error">{errorConectividad}</p>
          ) : (
            <TablaConectividad
              fuentes={conectividad?.fuentes ?? []}
              vacio="No hay fuentes de red registradas para tu equipo."
            />
          )}
        </div>
      </div>
    </div>
  );
};
