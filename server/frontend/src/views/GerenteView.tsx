import React, { useState, useEffect } from 'react';
import { Building2, Users } from 'lucide-react';
import { api } from '../services/api';
import { ORDEN_DIMENSIONES, type OrganizacionData, type LiderEquipoData } from '../types';
import { PageHead } from '../components/PageHead';
import { RingProgress } from '../components/RingProgress';
import { SpaceDims } from '../components/SpaceDims';
import { PersonCard } from '../components/PersonCard';
import { colorPuntaje } from '../utils/helpers';

export const GerenteView: React.FC = () => {
  const [data, setData] = useState<OrganizacionData | null>(null);
  const [cargando, setCargando] = useState(true);
  const [equipoDetalle, setEquipoDetalle] = useState<{
    nombre: string;
    equipo: LiderEquipoData;
  } | null>(null);
  const [cargandoEquipo, setCargandoEquipo] = useState(false);

  useEffect(() => {
    api<OrganizacionData>('/api/organizacion')
      .then((res) => setData(res))
      .catch((err) => console.error(err))
      .finally(() => setCargando(false));
  }, []);

  const handleVerEquipo = async (liderId: string, nombre: string) => {
    setCargandoEquipo(true);
    try {
      const eq = await api<LiderEquipoData>(`/api/organizacion/equipo/${liderId}`);
      setEquipoDetalle({ nombre, equipo: eq });
      setTimeout(() => {
        document.getElementById('detalle')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 50);
    } catch (err) {
      console.error(err);
    } finally {
      setCargandoEquipo(false);
    }
  };

  if (cargando || !data) {
    return <div className="page"><p className="lead">Cargando organización...</p></div>;
  }

  return (
    <div className="page">
      <PageHead
        title="Organización"
        subtitle="Vista de gerente. Los equipos en cascada y la métrica de cada líder."
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
            <div className="card-tag">Métrica</div>
          </div>
          <div className="connrow">
            <RingProgress
              value={data.metricaOrganizacion}
              color={colorPuntaje(data.metricaOrganizacion)}
              label={data.metricaOrganizacion}
              sub="global"
            />
            <div className="txt">
              <div className="k">Promedio de los equipos</div>
              <div className="v">{data.equipos.length} equipos</div>
              <div className="s">Vista en cascada, sin exponer a una persona.</div>
            </div>
          </div>
          <div className="card-foot">La métrica de cada líder es la agregación de su equipo.</div>
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
          <div className="people">
            {data.equipos.map((eq) => (
              <div key={eq.lider.id} className="team">
                <RingProgress
                  value={eq.metricaLider}
                  size={62}
                  color={colorPuntaje(eq.metricaLider)}
                  label={eq.metricaLider}
                />
                <div className="info">
                  <b>{eq.lider.nombre}</b> <span>· {eq.tamano} personas</span>
                  <div className="dimsmall">
                    {ORDEN_DIMENSIONES.map((k) => (
                      <i
                        key={k}
                        style={{ '--w': `${eq.agregadoDimensiones[k] ?? 0}%` } as React.CSSProperties}
                      />
                    ))}
                  </div>
                </div>
                {eq.preguntasAbiertas ? (
                  <span className="chip warn">{eq.preguntasAbiertas} para revisar</span>
                ) : (
                  <span className="chip ok">al día</span>
                )}
                <button
                  className="btn ghost"
                  onClick={() => handleVerEquipo(eq.lider.id, eq.lider.nombre)}
                  disabled={cargandoEquipo}
                >
                  Ver equipo
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Detalle del equipo seleccionado */}
      {equipoDetalle && (
        <div id="detalle" className="card span2" style={{ marginTop: '22px' }}>
          <div className="card-head">
            <div className="icon-chip">
              <Users size={22} />
            </div>
            <div>
              <h3 className="card-title">Equipo de {equipoDetalle.nombre}</h3>
              <div className="card-sub">
                Métrica del equipo: {equipoDetalle.equipo.metricaLider}/100
              </div>
            </div>
          </div>
          <div style={{ marginBottom: '14px' }}>
            <SpaceDims dimensiones={equipoDetalle.equipo.agregadoDimensiones} />
          </div>
          <div className="people">
            {equipoDetalle.equipo.integrantes.map((i, idx) => (
              <PersonCard key={i.usuario.id || idx} integrante={i} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
