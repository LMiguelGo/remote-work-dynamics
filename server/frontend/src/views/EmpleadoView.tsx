import React, { useState, useEffect } from 'react';
import { Clock, Thermometer, Shield, Wifi, Gauge, Lock } from 'lucide-react';
import { api } from '../services/api';
import type { EmpleadoPanelData } from '../types';
import { PageHead } from '../components/PageHead';
import { RingProgress } from '../components/RingProgress';
import { Sparkline } from '../components/Sparkline';

export const EmpleadoView: React.FC = () => {
  const [data, setData] = useState<EmpleadoPanelData | null>(null);
  const [cargando, setCargando] = useState(true);

  // Microencuesta state
  const [enps, setEnps] = useState(4);
  const [flujo, setFlujo] = useState(4);
  const [fatiga, setFatiga] = useState(2);
  const [enviandoEncuesta, setEnviandoEncuesta] = useState(false);

  // Umbrales state
  const [uTempMin, setUTempMin] = useState<string>('');
  const [uTempMax, setUTempMax] = useState<string>('');
  const [uHumMin, setUHumMin] = useState<string>('');
  const [uHumMax, setUHumMax] = useState<string>('');
  const [uConMin, setUConMin] = useState<string>('');
  const [umbralOk, setUmbralOk] = useState(false);
  const [guardandoUmbrales, setGuardandoUmbrales] = useState(false);

  // Transparencia state
  const [transpOpen, setTranspOpen] = useState(false);

  const cargarDatos = async () => {
    try {
      const res = await api<EmpleadoPanelData>('/api/mi-panel');
      setData(res);
      setUTempMin(res.umbrales.temperatura.minimo?.toString() ?? '');
      setUTempMax(res.umbrales.temperatura.maximo?.toString() ?? '');
      setUHumMin(res.umbrales.humedad.minimo?.toString() ?? '');
      setUHumMax(res.umbrales.humedad.maximo?.toString() ?? '');
      setUConMin(res.umbrales.calidad_conexion.minimo?.toString() ?? '');
    } catch (err) {
      console.error(err);
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    cargarDatos();
  }, []);

  if (cargando || !data) {
    return <div className="page"><p className="lead">Cargando tu panel...</p></div>;
  }

  const amb = data.ambiente;
  const con = data.conexion;
  const sinAlertas = data.alertas.length === 0;
  const bienOk = data.bienestar.nivel >= 80;

  const j = data.jornada;
  const abierta = j.estado === 'abierta';
  const ext = j.extralaboralPct;
  const extTexto =
    ext == null ? 'Sin jornadas cerradas aún' : `${ext > 0 ? '+' : ''}${ext}% frente a la jornada pactada`;

  const handleToggleJornada = async () => {
    const accion = abierta ? 'finalizar' : 'iniciar';
    await api(`/api/jornada/${accion}`, { method: 'POST' });
    await cargarDatos();
  };

  const handleEnviarEncuesta = async (e: React.FormEvent) => {
    e.preventDefault();
    setEnviandoEncuesta(true);
    try {
      await api('/api/encuesta-diaria', {
        method: 'POST',
        body: JSON.stringify({ enps, flujo, fatiga }),
      });
      await cargarDatos();
    } finally {
      setEnviandoEncuesta(false);
    }
  };

  const handleGuardarUmbrales = async () => {
    const num = (v: string) => (v.trim() === '' ? null : Number(v));
    setGuardandoUmbrales(true);
    try {
      await api('/api/umbrales', {
        method: 'PUT',
        body: JSON.stringify({
          temperatura: { minimo: num(uTempMin), maximo: num(uTempMax) },
          humedad: { minimo: num(uHumMin), maximo: num(uHumMax) },
          calidad_conexion: { minimo: num(uConMin), maximo: null },
        }),
      });
      setUmbralOk(true);
      setTimeout(() => setUmbralOk(false), 4000);
    } finally {
      setGuardandoUmbrales(false);
    }
  };

  return (
    <div className="page">
      <PageHead
        title="Mi entorno laboral"
        subtitle="Vista personal. Condiciones contextuales de tu espacio de trabajo."
        pill="Empleado"
      />

      <div className="grid">
        {/* Card 1: Mi Jornada */}
        <div className="card" style={{ '--i': 0 } as React.CSSProperties}>
          <div className="card-head">
            <div className="icon-chip">
              <Clock size={22} />
            </div>
            <div>
              <h3 className="card-title">Mi jornada</h3>
            </div>
            <div className="card-tag">Tiempo</div>
          </div>
          <div className="dotline">
            <span className={`dot ${abierta ? 'blue' : ''}`} /> Jornada{' '}
            {abierta ? 'en curso' : 'cerrada'}
            {j.horasHoy != null ? ` · ${j.horasHoy} h hoy` : ''}
          </div>
          <div className="stats" style={{ marginTop: '16px' }}>
            <div className="stat">
              <div className="k">Jornada pactada</div>
              <div className="v">
                {j.horasPactadas}
                <small>h</small>
              </div>
            </div>
            <div className="stat">
              <div className="k">Tiempo extralaboral</div>
              <div className="v">
                {ext == null ? '—' : `${ext > 0 ? '+' : ''}${ext}`}
                <small>%</small>
              </div>
            </div>
          </div>
          <div className="ctx" style={{ marginTop: 0 }}>
            Contexto, no afecta tu evaluación: {extTexto}.
          </div>
          <button
            className={`btn ${abierta ? '' : 'solid'}`}
            style={{ marginTop: '16px' }}
            onClick={handleToggleJornada}
          >
            {abierta ? 'Finalizar jornada' : 'Iniciar jornada'}
          </button>

          {data.encuestaPendiente ? (
            <div
              id="micro"
              style={{
                marginTop: '20px',
                borderTop: '1px dashed var(--line)',
                paddingTop: '18px',
              }}
            >
              <div className="section-label">Microencuesta al cerrar el día</div>
              <form onSubmit={handleEnviarEncuesta}>
                <div className="field">
                  <label>¿Cómo terminas el día? (1 muy mal · 5 muy bien)</label>
                  <select value={enps} onChange={(e) => setEnps(Number(e.target.value))}>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label>¿Pudiste concentrarte sin interrupciones? (1 nada · 5 mucho)</label>
                  <select value={flujo} onChange={(e) => setFlujo(Number(e.target.value))}>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label>Nivel de fatiga al terminar (1 ninguna · 5 mucha)</label>
                  <select value={fatiga} onChange={(e) => setFatiga(Number(e.target.value))}>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </div>
                <button type="submit" className="btn solid" disabled={enviandoEncuesta}>
                  {enviandoEncuesta ? 'Enviando...' : 'Enviar microencuesta'}
                </button>
              </form>
              <p className="card-foot">
                Alimenta tu dimensión de satisfacción y bienestar. Tú no ves el puntaje; solo tu líder, para acompañarte.
              </p>
            </div>
          ) : (
            <p className="card-foot">Ya respondiste la microencuesta de hoy. Gracias.</p>
          )}
        </div>

        {/* Card 2: Condiciones Ambientales */}
        <div className="card" style={{ '--i': 1 } as React.CSSProperties}>
          <div className="card-head">
            <div className="icon-chip">
              <Thermometer size={22} />
            </div>
            <div>
              <h3 className="card-title">Condiciones ambientales</h3>
            </div>
            <div className="card-tag">Espacio físico</div>
          </div>
          <div className="stats">
            <div className="stat">
              <div className="k">Temperatura</div>
              <div className="v">
                {amb.temperatura ?? '—'}
                <small>°C</small>
              </div>
            </div>
            <div className="stat">
              <div className="k">Humedad</div>
              <div className="v">
                {amb.humedad ?? '—'}
                <small>%</small>
              </div>
            </div>
            <div className="stat">
              <div className="k">Presión</div>
              <div className="v">
                {amb.presion ?? '—'}
                <small>hPa</small>
              </div>
            </div>
          </div>
          <div className="section-label">Variación de temperatura reciente</div>
          <Sparkline values={amb.serieTemp} />
          <div className="dotline" style={{ marginTop: '14px' }}>
            <span className={`dot ${amb.estado === 'Normal' ? '' : 'amber'}`} /> Estado ambiental: {amb.estado}
          </div>
          <div className="card-foot">Fuente: BME280</div>
        </div>

        {/* Card 3: Alertas Preventivas */}
        <div className="card" style={{ '--i': 2 } as React.CSSProperties}>
          <div className="card-head">
            <div className="icon-chip green">
              <Shield size={22} />
            </div>
            <div>
              <h3 className="card-title">Alertas preventivas</h3>
              <div className="card-sub">Bienestar</div>
            </div>
            <div className="card-tag">Bienestar</div>
          </div>
          <div className="big">
            {sinAlertas
              ? 'Sin alertas activas'
              : `${data.alertas.length} alerta${data.alertas.length > 1 ? 's' : ''} activa${data.alertas.length > 1 ? 's' : ''}`}
          </div>
          {sinAlertas ? (
            <p className="lead">Tus condiciones ambientales están dentro de los parámetros saludables.</p>
          ) : (
            <ul>
              {data.alertas.map((a) => (
                <li key={a.id}>
                  <b>{a.tipo}:</b> {a.mensaje}
                </li>
              ))}
            </ul>
          )}
          <div className="progress" style={{ marginTop: '10px' }}>
            <span style={{ width: `${data.bienestar.nivel}%` }} />
          </div>
          <div className="section-label" style={{ marginTop: '8px' }}>
            Indicador de bienestar
          </div>
          <div className="dotline">
            <span className={`dot ${bienOk ? '' : 'amber'}`} /> {data.bienestar.texto}
          </div>
          <div className="card-foot">Fuente: BME280</div>
        </div>

        {/* Card 4: Conectividad laboral */}
        <div className="card" style={{ '--i': 3 } as React.CSSProperties}>
          <div className="card-head">
            <div className="icon-chip">
              <Wifi size={22} />
            </div>
            <div>
              <h3 className="card-title">Conectividad laboral</h3>
            </div>
            <div className="card-tag">Red y VPN</div>
          </div>
          <div className="connrow">
            <RingProgress
              value={con.calidad}
              color={con.vpn ? 'var(--green)' : 'var(--amber)'}
              label={con.vpn ? 'Protegida' : 'Revisar'}
              sub={`${con.calidad ?? '—'}/100`}
            />
            <div className="txt">
              <div className="k">Estado de conexión</div>
              <div className="v">{con.estado}</div>
              <div className="s">{con.vpn ? 'VPN activa · Red segura' : 'Revisa tu red local'}</div>
            </div>
          </div>
          <div
            className="rowhi"
            style={con.vpn ? {} : { background: 'var(--amber-soft)', color: 'var(--amber)' }}
          >
            <span className={`dot ${con.vpn ? 'blue' : 'amber'}`} />
            {con.vpn ? 'VPN activa · Red segura' : 'Conexión inestable'}
          </div>
          <div className="card-foot">Fuente: Estado de red</div>
        </div>

        {/* Card 5: Mis Umbrales */}
        <div className="card" id="card-umbrales" style={{ '--i': 4 } as React.CSSProperties}>
          <div className="card-head">
            <div className="icon-chip">
              <Gauge size={22} />
            </div>
            <div>
              <h3 className="card-title">Mis umbrales</h3>
            </div>
            <div className="card-tag">Ambiente</div>
          </div>
          <p className="lead">
            Define desde qué valores quieres que te avise el sistema. Al superarlos se genera una alerta
            de bienestar, que es contexto y no afecta tu evaluación.
          </p>
          <div className="umbral-grid">
            <div className="field">
              <label>Temperatura mínima (°C)</label>
              <input
                type="number"
                step="0.5"
                value={uTempMin}
                onChange={(e) => setUTempMin(e.target.value)}
              />
            </div>
            <div className="field">
              <label>Temperatura máxima (°C)</label>
              <input
                type="number"
                step="0.5"
                value={uTempMax}
                onChange={(e) => setUTempMax(e.target.value)}
              />
            </div>
            <div className="field">
              <label>Humedad mínima (%)</label>
              <input
                type="number"
                value={uHumMin}
                onChange={(e) => setUHumMin(e.target.value)}
              />
            </div>
            <div className="field">
              <label>Humedad máxima (%)</label>
              <input
                type="number"
                value={uHumMax}
                onChange={(e) => setUHumMax(e.target.value)}
              />
            </div>
            <div className="field">
              <label>Conexión mínima (/100)</label>
              <input
                type="number"
                value={uConMin}
                onChange={(e) => setUConMin(e.target.value)}
              />
            </div>
          </div>
          <button className="btn" onClick={handleGuardarUmbrales} disabled={guardandoUmbrales}>
            {guardandoUmbrales ? 'Guardando...' : 'Guardar umbrales'}
          </button>
          {umbralOk && (
            <span className="dotline" style={{ marginTop: '12px' }}>
              <span className="dot" /> Umbrales actualizados
            </span>
          )}
        </div>

        {/* Card 6: Transparencia */}
        <div className="card" id="card-transparencia" style={{ '--i': 5 } as React.CSSProperties}>
          <div className="card-head">
            <div className="icon-chip">
              <Lock size={22} />
            </div>
            <div>
              <h3 className="card-title">Transparencia de datos</h3>
            </div>
            <div className="card-tag">Garantía</div>
          </div>
          <p className="lead">
            Conoce qué información se recopila y qué no. Este panel nunca muestra tu productividad individual;
            esa lectura solo la ve tu líder, con fines de acompañamiento.
          </p>
          <button className="btn" onClick={() => setTranspOpen(!transpOpen)}>
            ¿Qué información recopilamos? ↗
          </button>
          {transpOpen && (
            <div id="transpPanel" style={{ marginTop: '16px' }}>
              <div className="section-label">Se recoge</div>
              <ul>
                {data.queSeCaptura.length > 0 ? (
                  data.queSeCaptura.map((x, i) => (
                    <li key={i}>
                      {x.fuente} · {x.tipo}
                    </li>
                  ))
                ) : (
                  <li>Sin registros aún.</li>
                )}
              </ul>
              <div className="section-label" style={{ marginTop: '12px' }}>
                No se recoge
              </div>
              <ul>
                <li>El contenido de tus comunicaciones</li>
                <li>Pulsaciones de teclado</li>
                <li>Audio ni video</li>
                <li>Las páginas o dominios que visitas</li>
              </ul>
              <p className="card-foot">
                Estado de la captura: <b>{data.capturaActiva ? 'activa' : 'en pausa'}</b>
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
