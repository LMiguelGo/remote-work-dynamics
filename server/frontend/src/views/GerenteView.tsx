import React, { useState, useEffect, useCallback } from 'react';
import { Building2, Users } from 'lucide-react';
import { api } from '../services/api';
import {
  DIMN,
  ORDEN_DIMENSIONES,
  type EquipoLiderData,
  type OrganizacionGerenteData,
} from '../types';
import { PageHead } from '../components/PageHead';
import { SemaphoreChip } from '../components/SemaphoreChip';
import { iniciales, nombreUsuario } from '../utils/helpers';
import { contarCriticos, dimensionDe, fmtPuntaje, nivelCriticidad } from '../utils/space';

function nombreLider(eq: EquipoLiderData): string {
  return eq.lider ? nombreUsuario(eq.lider) : 'Equipo sin líder asignado';
}

export const GerenteView: React.FC = () => {
  const [data, setData] = useState<OrganizacionGerenteData | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Índice del equipo cuyo detalle se muestra (los integrantes ya vienen en la respuesta).
  const [seleccionado, setSeleccionado] = useState<number | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      setData(await api<OrganizacionGerenteData>('/api/organizacion'));
      setError(null);
    } catch (err) {
      // 401 y debe_cambiar_clave ya los resuelve AuthContext.
      setError(err instanceof Error ? err.message : 'No se pudo cargar la organización');
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
        <p className="lead">Cargando organización...</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="page">
        <p className="error">{error ?? 'No se pudo cargar la organización.'}</p>
        <button className="btn" onClick={() => void cargar()}>
          Reintentar
        </button>
      </div>
    );
  }

  const equipos = data.equipos ?? [];
  const totalIntegrantes = equipos.reduce((acc, eq) => acc + eq.integrantes.length, 0);
  const criticosDe = (eq: EquipoLiderData) =>
    eq.integrantes.reduce((acc, i) => acc + contarCriticos(i), 0);
  const totalCriticos = equipos.reduce((acc, eq) => acc + criticosDe(eq), 0);
  const detalle = seleccionado != null ? equipos[seleccionado] : null;

  const verEquipo = (idx: number) => {
    setSeleccionado(idx);
    setTimeout(() => {
      document.getElementById('detalle')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
  };

  return (
    <div className="page">
      <PageHead
        title="Organización"
        subtitle="Vista de gerente. Los equipos en cascada y su estado por dimensión."
        pill="Gerente"
      />

      <div className="grid">
        {/* Card 1: Resumen */}
        <div className="card" style={{ '--i': 0 } as React.CSSProperties}>
          <div className="card-head">
            <div className="icon-chip">
              <Building2 size={22} />
            </div>
            <div>
              <h3 className="card-title">Resumen de la organización</h3>
            </div>
            <div className="card-tag">Semana</div>
          </div>
          <div className="stats">
            <div className="stat">
              <div className="k">Equipos</div>
              <div className="v">{equipos.length}</div>
            </div>
            <div className="stat">
              <div className="k">Personas</div>
              <div className="v">{totalIntegrantes}</div>
            </div>
            <div className="stat">
              <div className="k">Dimensiones críticas</div>
              <div className="v">{totalCriticos}</div>
            </div>
          </div>
          <div className="card-foot">Vista en cascada. Apoya tu decisión, no decide por ti.</div>
        </div>

        {/* Card 2: Equipos */}
        <div className="card span2" style={{ '--i': 1 } as React.CSSProperties}>
          <div className="card-head">
            <div className="icon-chip">
              <Users size={22} />
            </div>
            <div>
              <h3 className="card-title">Equipos</h3>
              <div className="card-sub">Toca ver equipo para bajar a los integrantes</div>
            </div>
          </div>

          {equipos.length === 0 ? (
            <p className="lead">No hay equipos asignados a tu organización.</p>
          ) : (
            <div className="people">
              {equipos.map((eq, idx) => {
                const criticos = criticosDe(eq);
                const agregado = eq.equipo?.agregado ?? null;
                return (
                  <div key={eq.lider?.id ?? `sin-lider-${idx}`} className="team">
                    <div className="info">
                      <b>{nombreLider(eq)}</b> <span>· {eq.integrantes.length} personas</span>
                      {agregado ? (
                        <div className="dimsmall">
                          {ORDEN_DIMENSIONES.map((k) => {
                            const a = agregado.find((x) => x.dimension === k);
                            return (
                              <i
                                key={k}
                                title={`${DIMN[k]}: ${fmtPuntaje(a?.normalized_score)}`}
                                style={
                                  { '--w': `${(a?.normalized_score ?? 0) * 10}%` } as React.CSSProperties
                                }
                              />
                            );
                          })}
                        </div>
                      ) : (
                        <div className="card-foot">Sin resultados de analítica todavía</div>
                      )}
                    </div>
                    {criticos > 0 ? (
                      <span className="chip warn">{criticos} para revisar</span>
                    ) : (
                      <span className="chip ok">sin críticos</span>
                    )}
                    <button className="btn ghost" onClick={() => verEquipo(idx)}>
                      Ver equipo
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Detalle del equipo seleccionado */}
      {detalle && (
        <div id="detalle" className="card span2" style={{ marginTop: '22px' }}>
          <div className="card-head">
            <div className="icon-chip">
              <Users size={22} />
            </div>
            <div>
              <h3 className="card-title">Equipo de {nombreLider(detalle)}</h3>
              <div className="card-sub">Puntajes de 0 a 10; el color lo define la analítica</div>
            </div>
          </div>

          {detalle.integrantes.length === 0 ? (
            <p className="lead">Este equipo no tiene integrantes asignados.</p>
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
                  </tr>
                </thead>
                <tbody>
                  {detalle.integrantes.map((i) => {
                    const nombre = nombreUsuario(i.usuario);
                    return (
                      <tr key={i.usuario.id}>
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
                                text={fmtPuntaje(dim?.normalized_score)}
                              />
                            </td>
                          );
                        })}
                      </tr>
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
      )}
    </div>
  );
};
