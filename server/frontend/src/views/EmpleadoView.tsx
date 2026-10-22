import React, { useState, useEffect, useCallback } from 'react';
import { Clock, Thermometer, Shield, Wifi, Gauge, Lock } from 'lucide-react';
import { api, ApiError } from '../services/api';
import type { EmpleadoPanelData, UmbralesAmbientales } from '../types';
import { PageHead } from '../components/PageHead';
import { fmtHora } from '../utils/helpers';

const ESCALA = [1, 2, 3, 4, 5];

// Campos de los umbrales en el formulario (texto, para permitir vacío mientras se escribe).
interface FormUmbrales {
  tMin: string;
  tMax: string;
  hMin: string;
  hMax: string;
  rMin: string;
  rMax: string;
}

const UMBRALES_VACIOS: FormUmbrales = { tMin: '', tMax: '', hMin: '', hMax: '', rMin: '', rMax: '' };

function aFormulario(u: UmbralesAmbientales | null): FormUmbrales {
  if (!u) return UMBRALES_VACIOS;
  return {
    tMin: String(u.temperatura_c?.min ?? ''),
    tMax: String(u.temperatura_c?.max ?? ''),
    hMin: String(u.humedad_pct?.min ?? ''),
    hMax: String(u.humedad_pct?.max ?? ''),
    rMin: String(u.ruido_db?.min ?? ''),
    rMax: String(u.ruido_db?.max ?? ''),
  };
}

function mensajeDeError(err: unknown): string[] {
  if (err instanceof ApiError && err.detalles?.length) return err.detalles;
  return [err instanceof Error ? err.message : 'Ocurrió un error inesperado'];
}

// Horas y minutos transcurridos desde un instante ISO.
function transcurrido(inicioISO: string | null): string | null {
  if (!inicioISO) return null;
  const ms = Date.now() - new Date(inicioISO).getTime();
  if (Number.isNaN(ms) || ms < 0) return null;
  const min = Math.floor(ms / 60000);
  return `${Math.floor(min / 60)} h ${min % 60} min`;
}

interface SelectEscalaProps {
  id: string;
  etiqueta: string;
  valor: number;
  onChange: (n: number) => void;
}

const SelectEscala: React.FC<SelectEscalaProps> = ({ id, etiqueta, valor, onChange }) => (
  <div className="field">
    <label htmlFor={id}>{etiqueta}</label>
    <select id={id} value={valor} onChange={(e) => onChange(Number(e.target.value))}>
      {ESCALA.map((n) => (
        <option key={n} value={n}>
          {n}
        </option>
      ))}
    </select>
  </div>
);

export const EmpleadoView: React.FC = () => {
  const [data, setData] = useState<EmpleadoPanelData | null>(null);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [errores, setErrores] = useState<string[]>([]);

  // Microencuesta diaria (4 preguntas, escala 1-5)
  const [satisfaccion, setSatisfaccion] = useState(4);
  const [herramientas, setHerramientas] = useState(4);
  const [fatiga, setFatiga] = useState(2);
  const [concentracion, setConcentracion] = useState(4);
  const [enviandoDiaria, setEnviandoDiaria] = useState(false);

  // Encuesta semanal (3 preguntas, escala 1-5)
  const [comunicacion, setComunicacion] = useState(4);
  const [coordinacion, setCoordinacion] = useState(4);
  const [documentacion, setDocumentacion] = useState(4);
  const [enviandoSemanal, setEnviandoSemanal] = useState(false);

  // Jornada
  const [cambiandoJornada, setCambiandoJornada] = useState(false);

  // Umbrales
  const [umbrales, setUmbrales] = useState<FormUmbrales>(UMBRALES_VACIOS);
  const [umbralOk, setUmbralOk] = useState(false);
  const [guardandoUmbrales, setGuardandoUmbrales] = useState(false);

  // Transparencia
  const [transpOpen, setTranspOpen] = useState(false);

  const cargarDatos = useCallback(async () => {
    try {
      const res = await api<EmpleadoPanelData>('/api/mi-panel');
      setData(res);
      setUmbrales(aFormulario(res.ambiente?.umbrales ?? null));
      setErrorCarga(null);
    } catch (err) {
      // 401 y debe_cambiar_clave ya los resuelve AuthContext; aquí solo se informa el resto.
      setErrorCarga(mensajeDeError(err)[0]);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    void cargarDatos();
  }, [cargarDatos]);

  if (cargando) {
    return (
      <div className="page">
        <p className="lead">Cargando tu panel...</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="page">
        <p className="error">{errorCarga ?? 'No se pudo cargar tu panel.'}</p>
        <button className="btn" onClick={() => void cargarDatos()}>
          Reintentar
        </button>
      </div>
    );
  }

  const amb = data.ambiente;
  const lectura = amb.ultima;
  const alertasActivas = data.alertas.filter((a) => !a.resolved_at);
  const sinAlertas = alertasActivas.length === 0;
  const abierta = data.jornada.start_time != null;
  const tiempoJornada = transcurrido(data.jornada.start_time);

  // Ejecuta una acción del formulario y muestra los errores del backend si falla.
  const ejecutar = async (accion: () => Promise<void>) => {
    setErrores([]);
    try {
      await accion();
    } catch (err) {
      setErrores(mensajeDeError(err));
    }
  };

  const handleToggleJornada = () =>
    ejecutar(async () => {
      setCambiandoJornada(true);
      try {
        if (abierta) {
          // El backend exige end_time (ISO 8601) para cerrar la jornada.
          await api('/api/jornada/finalizar', {
            method: 'POST',
            body: JSON.stringify({ end_time: new Date().toISOString() }),
          });
        } else {
          await api('/api/jornada/iniciar', { method: 'POST', body: JSON.stringify({}) });
        }
        await cargarDatos();
      } finally {
        setCambiandoJornada(false);
      }
    });

  const handleEncuestaDiaria = (e: React.FormEvent) => {
    e.preventDefault();
    void ejecutar(async () => {
      setEnviandoDiaria(true);
      try {
        await api('/api/encuesta-diaria', {
          method: 'POST',
          body: JSON.stringify({
            satisfaction_level: satisfaccion,
            tools_perception: herramientas,
            fatigue_level: fatiga,
            concentration_perception: concentracion,
          }),
        });
        await cargarDatos();
      } finally {
        setEnviandoDiaria(false);
      }
    });
  };

  const handleEncuestaSemanal = (e: React.FormEvent) => {
    e.preventDefault();
    void ejecutar(async () => {
      setEnviandoSemanal(true);
      try {
        await api('/api/encuesta-semanal', {
          method: 'POST',
          body: JSON.stringify({
            communication_quality: comunicacion,
            team_coordination: coordinacion,
            documentation_perception: documentacion,
          }),
        });
        await cargarDatos();
      } finally {
        setEnviandoSemanal(false);
      }
    });
  };

  const num = (v: string) => (v.trim() === '' ? NaN : Number(v));
  const valores = {
    tMin: num(umbrales.tMin),
    tMax: num(umbrales.tMax),
    hMin: num(umbrales.hMin),
    hMax: num(umbrales.hMax),
    rMin: num(umbrales.rMin),
    rMax: num(umbrales.rMax),
  };
  const todosLlenos = Object.values(valores).every((v) => Number.isFinite(v));
  const ordenOk =
    todosLlenos &&
    valores.tMin <= valores.tMax &&
    valores.hMin <= valores.hMax &&
    valores.rMin <= valores.rMax;

  const handleGuardarUmbrales = () =>
    ejecutar(async () => {
      setGuardandoUmbrales(true);
      try {
        // El backend exige los tres umbrales completos, con min y max numéricos.
        await api('/api/umbrales', {
          method: 'PUT',
          body: JSON.stringify({
            temperatura_c: { min: valores.tMin, max: valores.tMax },
            humedad_pct: { min: valores.hMin, max: valores.hMax },
            ruido_db: { min: valores.rMin, max: valores.rMax },
          }),
        });
        await cargarDatos();
        setUmbralOk(true);
        setTimeout(() => setUmbralOk(false), 4000);
      } finally {
        setGuardandoUmbrales(false);
      }
    });

  const campoUmbral = (
    id: string,
    etiqueta: string,
    clave: keyof FormUmbrales,
    step?: string,
  ) => (
    <div className="field">
      <label htmlFor={id}>{etiqueta}</label>
      <input
        id={id}
        type="number"
        step={step}
        value={umbrales[clave]}
        onChange={(e) => setUmbrales({ ...umbrales, [clave]: e.target.value })}
      />
    </div>
  );

  return (
    <div className="page">
      <PageHead
        title="Mi entorno laboral"
        subtitle="Vista personal. Condiciones contextuales de tu espacio de trabajo."
        pill="Empleado"
      />

      {errores.length > 0 && (
        <div className="error" role="alert">
          {errores.map((m) => (
            <p key={m}>{m}</p>
          ))}
        </div>
      )}

      <div className="grid">
        {/* Card 1: Mi jornada y encuestas */}
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
            <span className={`dot ${abierta ? 'blue' : ''}`} />{' '}
            {abierta ? 'Jornada en curso' : 'Sin jornada activa'}
          </div>
          {abierta && (
            <div className="stats" style={{ marginTop: '16px' }}>
              <div className="stat">
                <div className="k">Inicio</div>
                <div className="v" style={{ fontSize: '1rem' }}>
                  {fmtHora(data.jornada.start_time)}
                </div>
              </div>
              {tiempoJornada && (
                <div className="stat">
                  <div className="k">Transcurrido</div>
                  <div className="v" style={{ fontSize: '1rem' }}>
                    {tiempoJornada}
                  </div>
                </div>
              )}
            </div>
          )}
          <div className="ctx" style={{ marginTop: '12px' }}>
            Contexto, no afecta tu evaluación.
          </div>
          <button
            className={`btn ${abierta ? '' : 'solid'}`}
            style={{ marginTop: '16px' }}
            onClick={handleToggleJornada}
            disabled={cambiandoJornada}
          >
            {abierta ? 'Finalizar jornada' : 'Iniciar jornada'}
          </button>

          {data.encuestaDiariaPendiente ? (
            <div
              id="micro"
              style={{ marginTop: '20px', borderTop: '1px dashed var(--line)', paddingTop: '18px' }}
            >
              <div className="section-label">Microencuesta al cerrar el día</div>
              <form onSubmit={handleEncuestaDiaria}>
                <SelectEscala
                  id="enc-satisfaccion"
                  etiqueta="¿Cómo terminas el día? (1 muy mal · 5 muy bien)"
                  valor={satisfaccion}
                  onChange={setSatisfaccion}
                />
                <SelectEscala
                  id="enc-herramientas"
                  etiqueta="¿Las herramientas de trabajo te ayudaron hoy? (1 nada · 5 mucho)"
                  valor={herramientas}
                  onChange={setHerramientas}
                />
                <SelectEscala
                  id="enc-fatiga"
                  etiqueta="Nivel de fatiga al terminar (1 ninguna · 5 mucha)"
                  valor={fatiga}
                  onChange={setFatiga}
                />
                <SelectEscala
                  id="enc-concentracion"
                  etiqueta="¿Pudiste concentrarte sin interrupciones? (1 nada · 5 mucho)"
                  valor={concentracion}
                  onChange={setConcentracion}
                />
                <button type="submit" className="btn solid" disabled={enviandoDiaria}>
                  {enviandoDiaria ? 'Enviando...' : 'Enviar microencuesta'}
                </button>
              </form>
              <p className="card-foot">
                Alimenta tu dimensión de satisfacción y bienestar. Tú no ves el puntaje; solo tu
                líder, para acompañarte.
              </p>
            </div>
          ) : (
            <p className="card-foot">Ya respondiste la microencuesta de hoy. Gracias.</p>
          )}

          {data.encuestaSemanalPendiente && (
            <div
              style={{ marginTop: '20px', borderTop: '1px dashed var(--line)', paddingTop: '18px' }}
            >
              <div className="section-label">Encuesta de la semana</div>
              <form onSubmit={handleEncuestaSemanal}>
                <SelectEscala
                  id="sem-comunicacion"
                  etiqueta="Calidad de la comunicación del equipo (1 mala · 5 muy buena)"
                  valor={comunicacion}
                  onChange={setComunicacion}
                />
                <SelectEscala
                  id="sem-coordinacion"
                  etiqueta="Coordinación con tu equipo (1 mala · 5 muy buena)"
                  valor={coordinacion}
                  onChange={setCoordinacion}
                />
                <SelectEscala
                  id="sem-documentacion"
                  etiqueta="La documentación disponible te sirve (1 nada · 5 mucho)"
                  valor={documentacion}
                  onChange={setDocumentacion}
                />
                <button type="submit" className="btn solid" disabled={enviandoSemanal}>
                  {enviandoSemanal ? 'Enviando...' : 'Enviar encuesta semanal'}
                </button>
              </form>
            </div>
          )}
        </div>

        {/* Card 2: Condiciones ambientales */}
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
                {lectura?.temperature ?? '—'}
                <small>°C</small>
              </div>
            </div>
            <div className="stat">
              <div className="k">Humedad</div>
              <div className="v">
                {lectura?.humidity ?? '—'}
                <small>%</small>
              </div>
            </div>
            <div className="stat">
              <div className="k">Ruido</div>
              <div className="v">
                {lectura?.noise_level ?? '—'}
                <small>dB</small>
              </div>
            </div>
          </div>
          <div className="dotline" style={{ marginTop: '14px' }}>
            <span className={`dot ${amb.estado === 'Normal' ? '' : 'amber'}`} /> Estado ambiental:{' '}
            {amb.estado}
          </div>
          <div className="card-foot">
            {lectura ? `Última lectura: ${fmtHora(lectura.time)}` : 'Aún no hay lecturas del sensor.'}
          </div>
        </div>

        {/* Card 3: Alertas preventivas */}
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
              : `${alertasActivas.length} alerta${alertasActivas.length > 1 ? 's' : ''} activa${alertasActivas.length > 1 ? 's' : ''}`}
          </div>
          {sinAlertas ? (
            <p className="lead">No hay alertas de bienestar activas en este momento.</p>
          ) : (
            <ul>
              {alertasActivas.map((a) => (
                <li key={a.id}>
                  <b>{a.alert_type}:</b> {a.message}
                </li>
              ))}
            </ul>
          )}
          <div className="card-foot">Aquí aparecen las alertas de bienestar registradas para ti.</div>
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
            <div className="card-tag">Red</div>
          </div>
          <div className="txt">
            <div className="k">Estado de conexión</div>
            <div className="v">{data.conexion.estado}</div>
            <div className="s">
              {data.conexion.estado === 'Sin datos'
                ? 'Todavía no hay una fuente de red registrada para ti.'
                : 'Tu conexión está registrada.'}
            </div>
          </div>
        </div>

        {/* Card 5: Mis umbrales */}
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
            Define entre qué valores te sientes bien. Si la última lectura de tu espacio sale de ese
            rango, el estado ambiental pasa a «Alerta». Es contexto y no afecta tu evaluación.
          </p>
          <div className="umbral-grid">
            {campoUmbral('u-tmin', 'Temperatura mínima (°C)', 'tMin', '0.5')}
            {campoUmbral('u-tmax', 'Temperatura máxima (°C)', 'tMax', '0.5')}
            {campoUmbral('u-hmin', 'Humedad mínima (%)', 'hMin')}
            {campoUmbral('u-hmax', 'Humedad máxima (%)', 'hMax')}
            {campoUmbral('u-rmin', 'Ruido mínimo (dB)', 'rMin')}
            {campoUmbral('u-rmax', 'Ruido máximo (dB)', 'rMax')}
          </div>
          {todosLlenos && !ordenOk && (
            <p className="error">En cada umbral el mínimo no puede superar al máximo.</p>
          )}
          <button
            className="btn"
            onClick={handleGuardarUmbrales}
            disabled={guardandoUmbrales || !ordenOk}
          >
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
            Conoce qué información se recopila y qué no. Este panel nunca muestra tu productividad
            individual; esa lectura solo la ve tu líder, con fines de acompañamiento.
          </p>
          <button className="btn" onClick={() => setTranspOpen(!transpOpen)}>
            ¿Qué información recopilamos? ↗
          </button>
          {transpOpen && (
            <div id="transpPanel" style={{ marginTop: '16px' }}>
              <div className="section-label">Se recoge</div>
              <ul>
                <li>Condiciones de tu espacio: temperatura, humedad y nivel de ruido</li>
                <li>Inicio y fin de tu jornada</li>
                <li>Tus respuestas a las encuestas diaria y semanal</li>
                <li>Actividad verificable en las herramientas del equipo, sin su contenido</li>
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
                Estado de la captura:{' '}
                <b>
                  {data.capture_active == null
                    ? 'sin perfil configurado'
                    : data.capture_active
                      ? 'activa'
                      : 'en pausa'}
                </b>
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
