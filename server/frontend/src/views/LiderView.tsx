import React, { useState, useEffect } from 'react';
import { Users, BarChart3, Shield, ChevronDown } from 'lucide-react';
import { api } from '../services/api';
import { ORDEN_DIMENSIONES, type LiderEquipoData } from '../types';
import { PageHead } from '../components/PageHead';
import { RingProgress } from '../components/RingProgress';
import { SpaceDims } from '../components/SpaceDims';
import { SemaphoreChip } from '../components/SemaphoreChip';
import { RadarChart } from '../components/charts/RadarChart';
import { TemporalChart } from '../components/charts/TemporalChart';
import {
  iniciales,
  colorPuntaje,
  nivelPuntaje,
  nivelTemperatura,
  nivelConexion,
  nivelExtralaboral,
} from '../utils/helpers';

export const LiderView: React.FC = () => {
  const [data, setData] = useState<LiderEquipoData | null>(null);
  const [cargando, setCargando] = useState(true);
  const [openRows, setOpenRows] = useState<Record<number, boolean>>({});

  useEffect(() => {
    api<LiderEquipoData>('/api/equipo')
      .then((res) => setData(res))
      .catch((err) => console.error(err))
      .finally(() => setCargando(false));
  }, []);

  const toggleRow = (idx: number) => {
    setOpenRows((prev) => ({ ...prev, [idx]: !prev[idx] }));
  };

  if (cargando || !data) {
    return (
      <div className="page">
        <p className="lead">Cargando equipo...</p>
      </div>
    );
  }

  const integrantes = data.integrantes || [];
  const agregadoDims = data.agregadoDimensiones || { S: 0, P: 0, A: 0, C: 0, E: 0 };
  const metricaLider = data.metricaLider ?? 0;
  const serieAnimo = data.serieAnimo || [];
  const preguntasParaElLider = data.preguntasParaElLider || [];

  return (
    <div className="page">
      <PageHead
        title="Mi equipo"
        subtitle="Vista de líder. Desempeño individual de cada integrante y del equipo."
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
            <div className="card-tag">Métrica</div>
          </div>
          <div className="connrow">
            <RingProgress
              value={metricaLider}
              color={colorPuntaje(metricaLider)}
              label={metricaLider}
              sub="equipo"
            />
            <div className="txt">
              <div className="k">Métrica del equipo</div>
              <div className="v">{integrantes.length} integrantes</div>
              <div className="s">Apoya tu decisión, no decide por ti.</div>
            </div>
          </div>
          <div className="card-foot">
            Media geométrica de las cinco dimensiones. Una dimensión floja pesa en el resultado.
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
          <RadarChart agregadoDimensiones={agregadoDims} />
          <div className="card-foot">Promedio del equipo por dimensión, de 0 a 100.</div>
        </div>

        {/* Card 3: Patrones temporales */}
        <div className="card span2" id="card-temporal" style={{ '--i': 2 } as React.CSSProperties}>
          <div className="card-head">
            <div className="icon-chip">
              <BarChart3 size={22} />
            </div>
            <div>
              <h3 className="card-title">Patrones temporales</h3>
              <div className="card-sub">Fatiga y ánimo del equipo por día (microencuesta)</div>
            </div>
            <div className="card-tag">Correlación S</div>
          </div>
          {serieAnimo.length > 0 ? (
            <>
              <TemporalChart serieAnimo={serieAnimo} />
              <div className="card-foot">
                Doble eje: barras de fatiga (1 a 5) y líneas de ánimo y flujo. Cuando la fatiga sube hacia el final del período, el ánimo suele bajar.
              </div>
            </>
          ) : (
            <p className="lead">Aún no hay microencuestas suficientes en el período para trazar el patrón.</p>
          )}
        </div>

        {/* Card 4: Actividad general del equipo */}
        <div className="card span2" style={{ '--i': 3 } as React.CSSProperties}>
          <div className="card-head">
            <div className="icon-chip">
              <Users size={22} />
            </div>
            <div>
              <h3 className="card-title">Actividad general del equipo</h3>
              <div className="card-sub">
                Toca una fila para ver el desglose. Color según el diccionario de umbrales
              </div>
            </div>
          </div>
          <div className="tablewrap">
            <table className="tabla">
              <thead>
                <tr>
                  <th>Integrante</th>
                  <th>Métrica</th>
                  {ORDEN_DIMENSIONES.map((d) => (
                    <th key={d}>{d}</th>
                  ))}
                  <th>Contexto (T · Conex · Extra)</th>
                  <th>Revisar</th>
                </tr>
              </thead>
              <tbody>
                {integrantes.map((i, idx) => {
                  const c = i.contexto || {};
                  const flags = (i.banderas || []).length;
                  const isOpen = !!openRows[idx];
                  const dims = i.dimensiones || { S: 0, P: 0, A: 0, C: 0, E: 0 };
                  const u = i.usuario || { id: `${idx}`, nombre: 'Integrante', arquetipo: 'equipo' };

                  return (
                    <React.Fragment key={u.id || idx}>
                      <tr
                        className={`filarow ${isOpen ? 'open' : ''}`}
                        onClick={() => toggleRow(idx)}
                      >
                        <td>
                          <div className="idcell">
                            <span className="ava sm">{iniciales(u.nombre)}</span>
                            <div>
                              <b>{u.nombre}</b>
                              <span>{u.arquetipo || 'equipo'}</span>
                            </div>
                          </div>
                        </td>
                        <td className="numcell">
                          <span className="score">{i.compuesto ?? 0}</span>
                        </td>
                        {ORDEN_DIMENSIONES.map((d) => (
                          <td key={d} className="numcell">
                            <SemaphoreChip
                              level={nivelPuntaje(dims[d])}
                              text={dims[d]}
                            />
                          </td>
                        ))}
                        <td className="ctxcell">
                          <SemaphoreChip
                            level={nivelTemperatura(c.temperatura)}
                            text={c.temperatura != null ? `${c.temperatura}°` : '—'}
                          />{' '}
                          <SemaphoreChip
                            level={nivelConexion(c.calidad_conexion)}
                            text={c.calidad_conexion != null ? c.calidad_conexion : '—'}
                          />{' '}
                          <SemaphoreChip
                            level={nivelExtralaboral(c.extralaboral_pct)}
                            text={
                              c.extralaboral_pct != null
                                ? `${c.extralaboral_pct > 0 ? '+' : ''}${c.extralaboral_pct}%`
                                : '—'
                            }
                          />
                        </td>
                        <td className="numcell">
                          {flags ? (
                            <span className="chip warn">{flags}</span>
                          ) : (
                            <span className="chip ok">0</span>
                          )}
                          <span className="chev">
                            <ChevronDown size={16} />
                          </span>
                        </td>
                      </tr>
                      {isOpen && (
                        <tr className="filadetail">
                          <td colSpan={9}>
                            <SpaceDims dimensiones={dims} />
                            <div className="ctx">
                              Contexto, no puntúa: temperatura {c.temperatura ?? '—'} °C, conexión{' '}
                              {c.calidad_conexion ?? '—'}/100, tiempo extralaboral{' '}
                              {c.extralaboral_pct == null
                                ? '—'
                                : `${c.extralaboral_pct > 0 ? '+' : ''}${c.extralaboral_pct}%`}
                              . Cobertura: {i.cobertura ?? 0}/5 dimensiones con datos.
                            </div>
                            {(i.banderas || []).map((b, bIdx) => (
                              <div key={bIdx} className="pregunta">
                                {b}
                              </div>
                            ))}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="leyenda">
            <SemaphoreChip level="ok" text="Óptimo" />{' '}
            <SemaphoreChip level="warn" text="Precaución" />{' '}
            <SemaphoreChip level="bad" text="Crítico" />{' '}
            <span className="leyenda-nota">
              Las columnas S·P·A·C·E van de 0 a 100; el contexto usa los umbrales del diccionario.
            </span>
          </div>
        </div>

        {/* Card 5: Preguntas para revisar */}
        {preguntasParaElLider.length > 0 && (
          <div className="card span2" id="card-preguntas" style={{ '--i': 4 } as React.CSSProperties}>
            <div className="card-head">
              <div className="icon-chip green">
                <Shield size={22} />
              </div>
              <div>
                <h3 className="card-title">Preguntas para revisar</h3>
                <div className="card-sub">Patrones para conversar, no sanciones</div>
              </div>
            </div>
            {preguntasParaElLider.map((q, qIdx) =>
              (q.preguntas || []).map((t, tIdx) => (
                <div key={`${qIdx}-${tIdx}`} className="pregunta">
                  <b>{q.integrante}:</b> {t}
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
};
