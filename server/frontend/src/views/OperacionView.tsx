import React, { useState, useEffect, useCallback } from 'react';
import { Cpu, Wifi, Settings } from 'lucide-react';
import { api, ApiError } from '../services/api';
import type {
  RespuestaConectividad,
  RespuestaConfigOperacion,
  RespuestaDispositivos,
  SemaphoreLevel,
} from '../types';
import { PageHead } from '../components/PageHead';
import { SemaphoreChip } from '../components/SemaphoreChip';
import { fmtHora } from '../utils/helpers';

const REFRESCO_MS = 30000;

function nivelEstado(estado: string): SemaphoreLevel {
  if (estado === 'en vivo' || estado === 'con datos') return 'ok';
  if (estado === 'con historial') return 'warn';
  return 'none';
}

function num(v: number | null | undefined, decimales = 0): string {
  return v == null ? '—' : v.toFixed(decimales);
}

function nombreDueno(d: { username: string | null; full_name: string | null }): string {
  return d.full_name?.trim() || d.username || 'Sin asignar';
}

function mensajes(err: unknown): string[] {
  if (err instanceof ApiError && err.detalles?.length) return err.detalles;
  return [err instanceof Error ? err.message : 'Ocurrió un error inesperado'];
}

export const OperacionView: React.FC = () => {
  const [dispositivos, setDispositivos] = useState<RespuestaDispositivos | null>(null);
  const [conectividad, setConectividad] = useState<RespuestaConectividad | null>(null);
  const [config, setConfig] = useState<RespuestaConfigOperacion | null>(null);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);

  // Formulario de configuración (texto, para permitir vacío mientras se escribe).
  const [umbralVivo, setUmbralVivo] = useState('');
  const [retencion, setRetencion] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [guardado, setGuardado] = useState(false);
  const [erroresConfig, setErroresConfig] = useState<string[]>([]);

  // `inicial` carga también el formulario; el refresco automático no lo pisa.
  const cargar = useCallback(async (inicial: boolean) => {
    try {
      const [d, c, cfg] = await Promise.all([
        api<RespuestaDispositivos>('/api/operacion/dispositivos'),
        api<RespuestaConectividad>('/api/operacion/conectividad'),
        api<RespuestaConfigOperacion>('/api/operacion/config'),
      ]);
      setDispositivos(d);
      setConectividad(c);
      setConfig(cfg);
      if (inicial) {
        setUmbralVivo(String(cfg.config.umbral_en_vivo_segundos));
        setRetencion(String(cfg.config.ventana_retencion_dias));
      }
      setErrorCarga(null);
    } catch (err) {
      // 401 y debe_cambiar_clave ya los resuelve AuthContext.
      setErrorCarga(mensajes(err)[0]);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    void cargar(true);
    const t = setInterval(() => void cargar(false), REFRESCO_MS);
    return () => clearInterval(t);
  }, [cargar]);

  if (cargando) {
    return (
      <div className="page">
        <p className="lead">Cargando operación...</p>
      </div>
    );
  }

  if (!dispositivos || !conectividad || !config) {
    return (
      <div className="page">
        <p className="error">{errorCarga ?? 'No se pudo cargar la operación.'}</p>
        <button className="btn" onClick={() => void cargar(true)}>
          Reintentar
        </button>
      </div>
    );
  }

  const enVivo = dispositivos.dispositivos.filter((d) => d.estado === 'en vivo').length;
  const sinDatos = dispositivos.dispositivos.filter((d) => d.estado === 'sin datos').length;

  const umbralNum = Number(umbralVivo);
  const retencionNum = Number(retencion);
  const configValida =
    umbralVivo.trim() !== '' &&
    retencion.trim() !== '' &&
    Number.isInteger(umbralNum) &&
    umbralNum > 0 &&
    Number.isInteger(retencionNum) &&
    retencionNum > 0;

  const handleGuardar = async () => {
    setErroresConfig([]);
    setGuardando(true);
    try {
      await api('/api/operacion/config', {
        method: 'PUT',
        body: JSON.stringify({
          umbral_en_vivo_segundos: umbralNum,
          ventana_retencion_dias: retencionNum,
        }),
      });
      await cargar(true);
      setGuardado(true);
      setTimeout(() => setGuardado(false), 4000);
    } catch (err) {
      setErroresConfig(mensajes(err));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="page">
      <PageHead
        title="Operación"
        subtitle="Vista de gerente. Estado de las fuentes de datos y de la red del equipo."
        pill="Gerente"
      />

      <div className="grid">
        {/* Card 1: Dispositivos */}
        <div className="card span2" style={{ '--i': 0 } as React.CSSProperties}>
          <div className="card-head">
            <div className="icon-chip">
              <Cpu size={22} />
            </div>
            <div>
              <h3 className="card-title">Estado de dispositivos</h3>
              <div className="card-sub">
                {dispositivos.dispositivos.length} fuentes · {enVivo} en vivo · {sinDatos} sin datos
                · se actualiza cada 30 s
              </div>
            </div>
            <div className="card-tag">Fuentes</div>
          </div>

          {dispositivos.dispositivos.length === 0 ? (
            <p className="lead">No hay fuentes de datos registradas.</p>
          ) : (
            <div className="tablewrap">
              <table className="tabla">
                <thead>
                  <tr>
                    <th>Fuente</th>
                    <th>Tipo</th>
                    <th>Asignada a</th>
                    <th>Estado</th>
                    <th>Última actividad</th>
                  </tr>
                </thead>
                <tbody>
                  {dispositivos.dispositivos.map((d) => (
                    <tr key={d.id}>
                      <td>
                        <b>{d.identifier}</b>
                      </td>
                      <td>{d.source_type}</td>
                      <td>{nombreDueno(d.dueno)}</td>
                      <td>
                        <SemaphoreChip level={nivelEstado(d.estado)} text={d.estado} />
                      </td>
                      <td>{fmtHora(d.ultima_actividad)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="card-foot">
            «En vivo» significa actividad en los últimos {dispositivos.umbral_en_vivo_segundos}{' '}
            segundos. Última consulta: {fmtHora(dispositivos.generado_en)}.
          </div>
        </div>

        {/* Card 2: Conectividad */}
        <div className="card span2" style={{ '--i': 1 } as React.CSSProperties}>
          <div className="card-head">
            <div className="icon-chip">
              <Wifi size={22} />
            </div>
            <div>
              <h3 className="card-title">Conectividad</h3>
              <div className="card-sub">Última medición de red e interrupciones por fuente</div>
            </div>
            <div className="card-tag">Red</div>
          </div>

          {conectividad.fuentes.length === 0 ? (
            <p className="lead">
              No hay fuentes de red registradas. Cuando existan, aquí aparecerán su latencia,
              velocidad e interrupciones.
            </p>
          ) : (
            <div className="tablewrap">
              <table className="tabla">
                <thead>
                  <tr>
                    <th>Fuente</th>
                    <th>Estado</th>
                    <th>Latencia (ms)</th>
                    <th>Bajada (Mbps)</th>
                    <th>Subida (Mbps)</th>
                    <th>Pérdida (%)</th>
                    <th>Interrupciones</th>
                    <th>Medición</th>
                  </tr>
                </thead>
                <tbody>
                  {conectividad.fuentes.map((f) => (
                    <tr key={f.id}>
                      <td>
                        <b>{nombreDueno(f.dueno)}</b>
                        <div className="card-foot">{f.identifier}</div>
                      </td>
                      <td>
                        <SemaphoreChip level={nivelEstado(f.estado)} text={f.estado} />
                      </td>
                      <td>{num(f.qos?.latency_ms)}</td>
                      <td>{num(f.qos?.download_speed_mbps, 1)}</td>
                      <td>{num(f.qos?.upload_speed_mbps, 1)}</td>
                      <td>{num(f.qos?.packet_loss_percentage, 1)}</td>
                      <td>
                        {f.interrupcion
                          ? `${num(f.interrupcion.interruption_count)} (${num(
                              f.interrupcion.interruption_duration_seconds,
                            )} s)`
                          : '—'}
                      </td>
                      <td>{fmtHora(f.qos?.time ?? f.interrupcion?.time)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Card 3: Configuración */}
        <div className="card" style={{ '--i': 2 } as React.CSSProperties}>
          <div className="card-head">
            <div className="icon-chip">
              <Settings size={22} />
            </div>
            <div>
              <h3 className="card-title">Configuración de monitoreo</h3>
            </div>
            <div className="card-tag">Gerente</div>
          </div>
          <div className="field">
            <label htmlFor="cfg-vivo">Ventana «en vivo» (segundos)</label>
            <input
              id="cfg-vivo"
              type="number"
              min={1}
              value={umbralVivo}
              onChange={(e) => setUmbralVivo(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="cfg-ret">Retención visible de eventos (días)</label>
            <input
              id="cfg-ret"
              type="number"
              min={1}
              value={retencion}
              onChange={(e) => setRetencion(e.target.value)}
            />
          </div>
          <button className="btn" onClick={handleGuardar} disabled={guardando || !configValida}>
            {guardando ? 'Guardando...' : 'Guardar configuración'}
          </button>
          {guardado && (
            <span className="dotline" style={{ marginTop: '12px' }}>
              <span className="dot" /> Configuración actualizada
            </span>
          )}
          {erroresConfig.length > 0 && (
            <div className="error" role="alert">
              {erroresConfig.map((m) => (
                <p key={m}>{m}</p>
              ))}
            </div>
          )}
          <div className="card-foot">
            Persistencia: {config.persistencia}. Si se reinicia el backend, vuelve a los valores por
            defecto.
          </div>
        </div>
      </div>
    </div>
  );
};
