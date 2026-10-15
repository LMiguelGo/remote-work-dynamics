import React, { useState, useEffect, useRef } from 'react';
import { Cpu, Wifi, Activity, Shield, Settings, BarChart3 } from 'lucide-react';
import { api } from '../services/api';
import { PageHead } from '../components/PageHead';
import { SemaphoreChip } from '../components/SemaphoreChip';
import { BandChart } from '../components/charts/BandChart';
import { CHART_COLORS, type AlertBand } from '../components/charts/chartSetup';
import {
  fmtHora,
  nivelTemperatura,
  nivelHumedad,
  nivelRuido,
  nivelConexion,
} from '../utils/helpers';
import type { SemaphoreLevel } from '../types';

interface DispositivoItem {
  dispositivo: string;
  descripcion: string;
  asignadoA: string;
  estado: 'en vivo' | 'con historial' | 'inactivo';
  ultimaLectura: string | null;
  lecturas: {
    temperatura?: { valor: number | null; ts: string };
    humedad?: { valor: number | null; ts: string };
    ruido?: { valor: number | null; ts: string };
    calidad_conexion?: { valor: number | null; ts: string };
  };
}

interface EventoItem {
  ts: string;
  usuario: string;
  tipo: 'conexion' | 'sensor';
  mensaje: string;
}

interface ConectividadData {
  serie: {
    bandas: {
      calidad_conexion: { optimo: number; precaucion: number; critico: number };
      temperatura: { optimo: [number, number]; precaucion: [number, number] };
    };
    calidad_conexion: Array<{ ts: string; valor: number }>;
    temperatura: Array<{ ts: string; valor: number }>;
  };
  eventos: EventoItem[];
  ts: string;
}

interface SaludData {
  estado: string;
  base: string;
  conectores: Array<{ nombre: string; estado: string; ultimaIngesta: string | null }>;
}

interface ConfigData {
  intervaloSegundos: number;
  diccionario: Array<{
    dimension: string;
    metrica: string;
    optimo: string;
    precaucion: string;
    critico: string;
  }>;
}

function bandasConexion(b: { optimo: number; precaucion: number; critico: number }): AlertBand[] {
  if (!b) return [];
  return [
    { from: 0, to: b.critico, color: 'rgba(239,68,68,.10)' },
    { from: b.critico, to: b.precaucion, color: 'rgba(245,158,11,.10)' },
    { from: b.precaucion, to: 100, color: 'rgba(22,163,74,.10)' },
  ];
}

function bandasTemp(b: { optimo: [number, number]; precaucion: [number, number] }): AlertBand[] {
  if (!b || !b.optimo || !b.precaucion) return [];
  const [oA, oB] = b.optimo;
  const [pA, pB] = b.precaucion;
  return [
    { from: 0, to: pA, color: 'rgba(239,68,68,.10)' },
    { from: pA, to: oA, color: 'rgba(245,158,11,.10)' },
    { from: oA, to: oB, color: 'rgba(22,163,74,.10)' },
    { from: oB, to: pB, color: 'rgba(245,158,11,.10)' },
    { from: pB, to: 50, color: 'rgba(239,68,68,.10)' },
  ];
}

export const OperacionView: React.FC = () => {
  const [config, setConfig] = useState<ConfigData | null>(null);
  const [dispositivos, setDispositivos] = useState<DispositivoItem[]>([]);
  const [conectividad, setConectividad] = useState<ConectividadData | null>(null);
  const [salud, setSalud] = useState<SaludData | null>(null);
  const [cargando, setCargando] = useState(true);
  const [lastPollTime, setLastPollTime] = useState<string>(new Date().toLocaleTimeString());

  // Input config
  const [intervaloInput, setIntervaloInput] = useState<number>(5);
  const [cfgOk, setCfgOk] = useState(false);
  const pollTimerRef = useRef<number | null>(null);

  const fetchTodo = async () => {
    try {
      const [cfgRes, dzRes, cnRes, slRes] = await Promise.all([
        api<ConfigData>('/api/operacion/config'),
        api<{ dispositivos: DispositivoItem[] }>('/api/operacion/dispositivos'),
        api<ConectividadData>('/api/operacion/conectividad'),
        api<SaludData>('/api/salud'),
      ]);
      setConfig(cfgRes);
      setIntervaloInput(cfgRes.intervaloSegundos || 5);
      setDispositivos(dzRes.dispositivos);
      setConectividad(cnRes);
      setSalud(slRes);
      setLastPollTime(new Date().toLocaleTimeString());
    } catch (err) {
      console.error(err);
    } finally {
      setCargando(false);
    }
  };

  const tick = async () => {
    try {
      const [dz2, cn2] = await Promise.all([
        api<{ dispositivos: DispositivoItem[] }>('/api/operacion/dispositivos'),
        api<ConectividadData>('/api/operacion/conectividad'),
      ]);
      setDispositivos(dz2.dispositivos);
      setConectividad(cn2);
      setLastPollTime(new Date().toLocaleTimeString());
    } catch (err) {
      console.error('Error polling telemetría:', err);
    }
  };

  const startPolling = (intervalSecs: number) => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
    }
    const ms = Math.max(2, intervalSecs) * 1000;
    pollTimerRef.current = window.setInterval(tick, ms);
  };

  useEffect(() => {
    fetchTodo().then(() => {
      startPolling(5);
    });

    return () => {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
      }
    };
  }, []);

  const handleGuardarConfig = async () => {
    try {
      const nueva = await api<{ intervaloSegundos: number }>('/api/operacion/config', {
        method: 'PUT',
        body: JSON.stringify({ intervaloSegundos: Number(intervaloInput) }),
      });
      setIntervaloInput(nueva.intervaloSegundos);
      setCfgOk(true);
      setTimeout(() => setCfgOk(false), 4000);
      startPolling(nueva.intervaloSegundos);
    } catch (err) {
      console.error(err);
    }
  };

  if (cargando || !config || !conectividad || !salud) {
    return <div className="page"><p className="lead">Cargando panel de operación...</p></div>;
  }

  const bConn = conectividad.serie?.bandas?.calidad_conexion;
  const bTemp = conectividad.serie?.bandas?.temperatura;

  return (
    <div className="page">
      <PageHead
        title="Operación y dispositivos"
        subtitle="Panel administrativo. Estado de la infraestructura telemática, sin exponer la productividad de ninguna persona."
        pill="Gerente"
      />

      <div className="grid">
        {/* Card 1: Estado de dispositivos */}
        <div className="card span2" style={{ '--i': 0 } as React.CSSProperties}>
          <div className="card-head">
            <div className="icon-chip">
              <Cpu size={22} />
            </div>
            <div>
              <h3 className="card-title">Estado de dispositivos</h3>
              <div className="card-sub">Sensores y su última lectura · se refresca solo</div>
            </div>
            <div className="card-tag">En vivo</div>
          </div>
          <div className="tablewrap">
            <table className="tabla">
              <thead>
                <tr>
                  <th>Dispositivo</th>
                  <th>Asignado a</th>
                  <th>Estado</th>
                  <th>Temp</th>
                  <th>Humedad</th>
                  <th>Ruido</th>
                  <th>Conexión</th>
                  <th>Última lectura</th>
                </tr>
              </thead>
              <tbody>
                {dispositivos.map((d) => {
                  const t = d.lecturas?.temperatura?.valor ?? null;
                  const h = d.lecturas?.humedad?.valor ?? null;
                  const r = d.lecturas?.ruido?.valor ?? null;
                  const c = d.lecturas?.calidad_conexion?.valor ?? null;

                  const estadoClase: SemaphoreLevel =
                    d.estado === 'en vivo' ? 'ok' : d.estado === 'con historial' ? 'warn' : 'bad';

                  return (
                    <tr key={d.dispositivo}>
                      <td>
                        <div className="idcell">
                          <span className="ava sm">
                            <Cpu size={16} />
                          </span>
                          <div>
                            <b>{d.dispositivo}</b>
                            <span>{d.descripcion}</span>
                          </div>
                        </div>
                      </td>
                      <td>{d.asignadoA}</td>
                      <td>
                        <SemaphoreChip level={estadoClase} text={d.estado} />
                      </td>
                      <td className="numcell">
                        <SemaphoreChip
                          level={nivelTemperatura(t)}
                          text={t != null ? `${t}°` : '—'}
                        />
                      </td>
                      <td className="numcell">
                        <SemaphoreChip level={nivelHumedad(h)} text={h != null ? `${h}%` : '—'} />
                      </td>
                      <td className="numcell">
                        <SemaphoreChip level={nivelRuido(r)} text={r != null ? `${r} dB` : '—'} />
                      </td>
                      <td className="numcell">
                        <SemaphoreChip level={nivelConexion(c)} text={c != null ? c : '—'} />
                      </td>
                      <td className="tsmall">{fmtHora(d.ultimaLectura)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="card-foot">
            Actualizado: <span>{lastPollTime}</span> · intervalo {intervaloInput}s
          </div>
        </div>

        {/* Card 2: Eventos de conectividad (dual chart) */}
        <div className="card span2" style={{ '--i': 1 } as React.CSSProperties}>
          <div className="card-head">
            <div className="icon-chip">
              <Wifi size={22} />
            </div>
            <div>
              <h3 className="card-title">Eventos de conectividad</h3>
              <div className="card-sub">Calidad de conexión y temperatura con franjas de alerta</div>
            </div>
            <div className="card-tag">Tiempo real</div>
          </div>
          <div className="dualchart">
            <BandChart
              label="Calidad de conexión (/100)"
              points={conectividad.serie.calidad_conexion}
              bands={bandasConexion(bConn)}
              color={CHART_COLORS.blue}
              minY={0}
              maxY={100}
            />
            <BandChart
              label="Temperatura (°C)"
              points={conectividad.serie.temperatura}
              bands={bandasTemp(bTemp)}
              color={CHART_COLORS.amber}
              minY={10}
              maxY={35}
            />
          </div>
          <div className="leyenda" style={{ marginTop: '6px' }}>
            <SemaphoreChip level="ok" text="Óptimo" />{' '}
            <SemaphoreChip level="warn" text="Precaución" />{' '}
            <SemaphoreChip level="bad" text="Crítico" />{' '}
            <span className="leyenda-nota">Las franjas salen de los umbrales del diccionario.</span>
          </div>
        </div>

        {/* Card 3: Alertas de contexto recientes */}
        <div className="card span2" style={{ '--i': 2 } as React.CSSProperties}>
          <div className="card-head">
            <div className="icon-chip green">
              <Activity size={22} />
            </div>
            <div>
              <h3 className="card-title">Alertas de contexto recientes</h3>
              <div className="card-sub">Lecturas que rebasaron un umbral</div>
            </div>
          </div>
          <div className="tablewrap">
            <table className="tabla">
              <thead>
                <tr>
                  <th>Cuándo</th>
                  <th>Quién · tipo</th>
                  <th>Detalle</th>
                </tr>
              </thead>
              <tbody>
                {conectividad.eventos.length > 0 ? (
                  conectividad.eventos.map((ev, i) => (
                    <tr key={i}>
                      <td className="tsmall">{fmtHora(ev.ts)}</td>
                      <td>
                        {ev.usuario}{' '}
                        <SemaphoreChip
                          level={ev.tipo === 'conexion' ? 'bad' : 'warn'}
                          text={ev.tipo}
                        />
                      </td>
                      <td>{ev.mensaje}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={3}>Sin eventos recientes.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Card 4: Salud de conectores */}
        <div className="card" style={{ '--i': 3 } as React.CSSProperties}>
          <div className="card-head">
            <div className="icon-chip">
              <Shield size={22} />
            </div>
            <div>
              <h3 className="card-title">Salud de conectores</h3>
              <div className="card-sub">RNF-05</div>
            </div>
          </div>
          <div className="conectores">
            {salud.conectores.map((c) => (
              <div key={c.nombre} className="conector">
                <span className={`dot ${c.estado === 'activo' ? '' : 'amber'}`} />
                <b>{c.nombre}</b>{' '}
                <SemaphoreChip
                  level={c.estado === 'activo' ? 'ok' : 'bad'}
                  text={c.estado}
                />
                <span className="tsmall">{fmtHora(c.ultimaIngesta)}</span>
              </div>
            ))}
          </div>
          <div className="card-foot">
            Base: {salud.base} · estado general: {salud.estado}
          </div>
        </div>

        {/* Card 5: Configuración de monitoreo */}
        <div className="card" style={{ '--i': 4 } as React.CSSProperties}>
          <div className="card-head">
            <div className="icon-chip">
              <Settings size={22} />
            </div>
            <div>
              <h3 className="card-title">Configuración de monitoreo</h3>
            </div>
            <div className="card-tag">Admin</div>
          </div>
          <div className="field">
            <label>Intervalo de muestreo en vivo (segundos)</label>
            <input
              type="number"
              min={2}
              max={60}
              value={intervaloInput}
              onChange={(e) => setIntervaloInput(Number(e.target.value))}
            />
          </div>
          <button className="btn" onClick={handleGuardarConfig}>
            Guardar
          </button>
          {cfgOk && (
            <span className="dotline" style={{ marginTop: '10px' }}>
              <span className="dot" /> Intervalo actualizado
            </span>
          )}
        </div>

        {/* Card 6: Diccionario de métricas y umbrales */}
        <div className="card span2" style={{ '--i': 5 } as React.CSSProperties}>
          <div className="card-head">
            <div className="icon-chip">
              <BarChart3 size={22} />
            </div>
            <div>
              <h3 className="card-title">Diccionario de métricas y umbrales</h3>
              <div className="card-sub">
                Referencia del equipo. Define el semáforo de todo el tablero
              </div>
            </div>
          </div>
          <div className="tablewrap">
            <table className="tabla compacta">
              <thead>
                <tr>
                  <th>Dim</th>
                  <th>Métrica</th>
                  <th>Óptimo</th>
                  <th>Precaución</th>
                  <th>Crítico</th>
                </tr>
              </thead>
              <tbody>
                {config.diccionario.map((m, idx) => (
                  <tr key={idx}>
                    <td>
                      <b>{m.dimension}</b>
                    </td>
                    <td>{m.metrica}</td>
                    <td>
                      <SemaphoreChip level="ok" text={m.optimo} />
                    </td>
                    <td>
                      <SemaphoreChip level="warn" text={m.precaucion} />
                    </td>
                    <td>
                      <SemaphoreChip level="bad" text={m.critico} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
