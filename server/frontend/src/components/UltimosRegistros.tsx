import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Database, RefreshCw } from 'lucide-react';
import { api } from '../services/api';
import type { RegistroReciente, RespuestaRegistros, TipoRegistro } from '../types';
import { fmtHora } from '../utils/helpers';
import {
  INTERVALO_ESP32_S,
  MUESTRAS_SIN_DATO,
  NOMBRE_VARIABLE,
  TIPOS_CON_NUEVOS,
  duracion,
  esNuevo,
  masReciente,
  variablesSinDatos,
  type FallaVariable,
  type VariableAmbiental,
} from '../utils/registros';

// La tarjeta se vuelve a consultar sola para que aparezcan los avisos y los registros nuevos. Las lecturas ambientales
// llegan cada 5 s (lo que tarda el ESP32 entre envíos), así que se consultan al mismo ritmo; el resto cada 30 s.
const REFRESCO_AMBIENTAL_MS = INTERVALO_ESP32_S * 1000;
const REFRESCO_MS = 30000;

// Hasta dónde vio esta persona cada lista (persona y tipo), guardado en el navegador. Si el navegador no deja guardar,
// la tarjeta funciona igual, solo que no recuerda la visita anterior.
function claveVisto(rutaBase: string, persona: number, tipo: TipoRegistro): string {
  return `ultimos-registros:visto:${rutaBase}:${persona}:${tipo}`;
}

function leerVisto(clave: string): string | null {
  try {
    return window.localStorage.getItem(clave);
  } catch {
    return null;
  }
}

function guardarVisto(clave: string, valor: string | null): void {
  if (!valor) return;
  try {
    window.localStorage.setItem(clave, valor);
  } catch {
    // Sin almacenamiento: no se recuerda la visita.
  }
}

function avisoSinDatos(campo: VariableAmbiental, f: FallaVariable): string {
  const nombre = NOMBRE_VARIABLE[campo];
  const desde =
    f.segundos == null
      ? 'No hay ningún dato reciente.'
      : `Último dato hace ${duracion(f.segundos)} (${fmtHora(f.ultimo)}).`;
  return (
    `El sensor dejó de enviar datos de ${nombre}. ${desde} ` +
    `Se avisa cuando faltan ${MUESTRAS_SIN_DATO} muestras seguidas; el ESP32 envía una cada ${INTERVALO_ESP32_S} s.`
  );
}

// Persona que se puede elegir en el selector. `grupo` agrupa las opciones (equipo del líder, en la vista del gerente).
export interface PersonaRegistros {
  id: number;
  nombre: string;
  grupo?: string;
}

type Valor = string | number | boolean | null | undefined;

interface Columna {
  titulo: string;
  valor: (d: RegistroReciente['datos']) => string;
  campo?: VariableAmbiental; // variable del sensor que muestra la columna
}

function texto(v: Valor): string {
  return v == null || v === '' ? '—' : String(v);
}

function numero(v: Valor, decimales = 0): string {
  return typeof v === 'number' ? v.toFixed(decimales) : '—';
}

function hora(v: Valor): string {
  return typeof v === 'string' ? fmtHora(v) : '—';
}

// Los avisos de PR integrado o cerrado no siempre traen las líneas; sin ninguno de los dos datos se muestra un guion.
function lineas(agregadas: Valor, borradas: Valor): string {
  if (typeof agregadas !== 'number' && typeof borradas !== 'number') return '—';
  return `+${numero(agregadas)} / −${numero(borradas)}`;
}

const ACCION_PR: Record<string, string> = {
  opened: 'Abierto',
  reopened: 'Reabierto',
  closed: 'Cerrado',
  merged: 'Integrado',
};

// Tipos de dato de la tarjeta, en el orden del selector, y las columnas de cada uno.
const TIPOS: { tipo: TipoRegistro; etiqueta: string; columnas: Columna[] }[] = [
  {
    tipo: 'working_session',
    etiqueta: 'Horas de inicio y finalización',
    columnas: [
      { titulo: 'Inicio', valor: (d) => hora(d.start_time) },
      { titulo: 'Finalización', valor: (d) => (d.end_time ? hora(d.end_time) : 'En curso') },
    ],
  },
  {
    tipo: 'daily_survey',
    etiqueta: 'Encuesta diaria',
    columnas: [
      { titulo: 'Satisfacción', valor: (d) => numero(d.satisfaction_level) },
      { titulo: 'Herramientas', valor: (d) => numero(d.tools_perception) },
      { titulo: 'Fatiga', valor: (d) => numero(d.fatigue_level) },
      { titulo: 'Concentración', valor: (d) => numero(d.concentration_perception) },
    ],
  },
  {
    tipo: 'weekly_survey',
    etiqueta: 'Encuesta semanal',
    columnas: [
      { titulo: 'Comunicación', valor: (d) => numero(d.communication_quality) },
      { titulo: 'Coordinación', valor: (d) => numero(d.team_coordination) },
      { titulo: 'Documentación', valor: (d) => numero(d.documentation_perception) },
    ],
  },
  {
    tipo: 'ambiental_reading',
    etiqueta: 'Lecturas ambientales',
    columnas: [
      { titulo: 'Temperatura (°C)', valor: (d) => numero(d.temperature, 1), campo: 'temperature' },
      { titulo: 'Humedad (%)', valor: (d) => numero(d.humidity, 1), campo: 'humidity' },
      { titulo: 'Ruido (dB)', valor: (d) => numero(d.noise_level, 1), campo: 'noise_level' },
    ],
  },
  {
    tipo: 'pull_request',
    etiqueta: 'Pull requests',
    columnas: [
      { titulo: 'PR', valor: (d) => (d.pr_number == null ? '—' : `#${d.pr_number}`) },
      { titulo: 'Acción', valor: (d) => ACCION_PR[String(d.action)] ?? texto(d.action) },
      { titulo: 'Líneas (+/−)', valor: (d) => lineas(d.lines_added, d.lines_deleted) },
      { titulo: 'Archivos', valor: (d) => numero(d.files_changed) },
    ],
  },
  {
    tipo: 'pull_request_review',
    etiqueta: 'Revisiones de pull requests',
    columnas: [
      { titulo: 'PR', valor: (d) => (d.pr_number == null ? '—' : `#${d.pr_number}`) },
      { titulo: 'Tiempo de respuesta (min)', valor: (d) => numero(d.review_responsiveness_minutes, 1) },
      { titulo: 'Comentarios', valor: (d) => numero(d.pr_comment_density) },
    ],
  },
  {
    tipo: 'commit',
    etiqueta: 'Commits',
    columnas: [
      { titulo: 'Commit', valor: (d) => texto(d.commit_hash) },
      { titulo: 'Prefijo', valor: (d) => texto(d.conventional_commit_prefix) },
    ],
  },
  {
    tipo: 'issue_created',
    etiqueta: 'Creación de issues en Jira',
    columnas: [
      { titulo: 'Issue', valor: (d) => texto(d.issue_key) },
      { titulo: 'Tipo', valor: (d) => texto(d.issue_type) },
      { titulo: 'Puntos', valor: (d) => numero(d.story_points) },
    ],
  },
  {
    tipo: 'issue_updated',
    etiqueta: 'Actualización de issues en Jira',
    columnas: [
      { titulo: 'Issue', valor: (d) => texto(d.issue_key) },
      { titulo: 'Cambio de estado', valor: (d) => `${texto(d.status_from)} → ${texto(d.status_to)}` },
      { titulo: 'Puntos', valor: (d) => numero(d.story_points) },
      { titulo: 'Resolución (h)', valor: (d) => numero(d.resolution_time_hours, 1) },
    ],
  },
];

interface Resultado {
  clave: string;
  respuesta: RespuestaRegistros | null;
  error: string | null;
  vistoHasta: string | null; // registros posteriores a esta hora se marcan como nuevos
}

interface Props {
  personas: PersonaRegistros[];
  rutaBase: '/api/equipo/integrantes' | '/api/organizacion/integrantes';
  id?: string;
  indice?: number;
}

// Tarjeta de últimos registros: la persona y el tipo de dato se eligen con dos selectores y cada cambio vuelve a
// consultar la base; además se vuelve a consultar sola cada 30 s. Sirve para comprobar que cada fuente está guardando
// datos: en las lecturas ambientales marca en rojo la variable que el sensor dejó de enviar, y en GitHub y Jira marca
// en verde lo que llegó desde la última vez que se miró.
export const UltimosRegistros: React.FC<Props> = ({ personas, rutaBase, id, indice = 0 }) => {
  const [personaElegida, setPersonaElegida] = useState<number | null>(null);
  const [tipo, setTipo] = useState<TipoRegistro>('working_session');
  // Sube con el botón Actualizar para repetir la misma consulta.
  const [version, setVersion] = useState(0);
  // Sube cada 5 s (lecturas ambientales) o 30 s (el resto): repite la consulta sin mostrar «Consultando...».
  const [tick, setTick] = useState(0);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  // Referencia de «nuevo» por persona y tipo, fija mientras la tarjeta está abierta: así un registro que llega con la
  // página abierta también queda en verde.
  const vistoRef = useRef<Record<string, string | null>>({});

  const refrescoMs = tipo === 'ambiental_reading' ? REFRESCO_AMBIENTAL_MS : REFRESCO_MS;
  useEffect(() => {
    const t = window.setInterval(() => setTick((n) => n + 1), refrescoMs);
    return () => window.clearInterval(t);
  }, [refrescoMs]);

  // Si la persona elegida ya no está en la lista (o aún no se eligió), se toma la primera.
  const personaId = personas.some((p) => p.id === personaElegida)
    ? personaElegida
    : (personas[0]?.id ?? null);
  const clave = `${personaId}|${tipo}|${version}`;

  // Cada cambio de persona, tipo, el botón Actualizar o el refresco de 30 s consulta la base. Si llega una respuesta de
  // una consulta anterior, se descarta.
  useEffect(() => {
    if (personaId == null) return;
    let vigente = true;
    api<RespuestaRegistros>(`${rutaBase}/${personaId}/registros?tipo=${encodeURIComponent(tipo)}`)
      .then((respuesta) => {
        if (!vigente) return;
        let vistoHasta: string | null = null;
        if (TIPOS_CON_NUEVOS.has(tipo)) {
          const k = claveVisto(rutaBase, personaId, tipo);
          // La primera consulta de esta lista toma como referencia la visita anterior; si no la hay, nada es nuevo.
          if (!(k in vistoRef.current)) vistoRef.current[k] = leerVisto(k) ?? masReciente(respuesta.registros);
          vistoHasta = vistoRef.current[k];
          guardarVisto(k, masReciente(respuesta.registros));
        }
        setResultado({ clave, respuesta, error: null, vistoHasta });
      })
      .catch((err: unknown) => {
        // 401 y debe_cambiar_clave ya los resuelve AuthContext.
        if (!vigente) return;
        const mensaje = err instanceof Error ? err.message : 'No se pudieron cargar los registros';
        // Si falla un refresco automático, se deja lo que ya se veía.
        setResultado((prev) =>
          prev && prev.clave === clave && prev.respuesta
            ? prev
            : { clave, respuesta: null, error: mensaje, vistoHasta: null },
        );
      });
    return () => {
      vigente = false;
    };
  }, [clave, personaId, tipo, rutaBase, tick]);

  const cargando = personaId != null && resultado?.clave !== clave;
  const respuesta = cargando ? null : (resultado?.respuesta ?? null);
  const error = cargando ? null : (resultado?.error ?? null);
  const def = TIPOS.find((t) => t.tipo === tipo) ?? TIPOS[0];
  const grupos = Array.from(new Set(personas.map((p) => p.grupo ?? '')));
  const registros = respuesta?.tipo === tipo ? respuesta.registros : [];
  // Variables que el sensor dejó de enviar (solo en lecturas ambientales).
  const fallas =
    tipo === 'ambiental_reading' && respuesta?.tipo === tipo
      ? variablesSinDatos(registros, respuesta.generado_en ?? new Date().toISOString())
      : {};
  const vistoHasta = resultado?.clave === clave && TIPOS_CON_NUEVOS.has(tipo) ? resultado.vistoHasta : null;

  return (
    <div className="card span2" id={id} style={{ '--i': indice } as React.CSSProperties}>
      <div className="card-head">
        <div className="icon-chip">
          <Database size={22} />
        </div>
        <div>
          <h3 className="card-title">Últimos registros</h3>
          <div className="card-sub">
            Los {respuesta?.limite ?? 10} datos más recientes de la persona, del último que llegó al primero
          </div>
        </div>
        <div className="card-tag">Fuentes</div>
      </div>

      {personas.length === 0 ? (
        <p className="lead">No hay integrantes para consultar.</p>
      ) : (
        <>
          <div className="registros-sel">
            <label className="an-sel">
              Persona
              <select
                value={personaId ?? ''}
                onChange={(e) => setPersonaElegida(Number(e.target.value))}
              >
                {grupos.map((g) =>
                  g ? (
                    <optgroup key={g} label={g}>
                      {personas
                        .filter((p) => p.grupo === g)
                        .map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.nombre}
                          </option>
                        ))}
                    </optgroup>
                  ) : (
                    personas
                      .filter((p) => !p.grupo)
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.nombre}
                        </option>
                      ))
                  ),
                )}
              </select>
            </label>
            <label className="an-sel">
              Tipo de dato
              <select value={tipo} onChange={(e) => setTipo(e.target.value as TipoRegistro)}>
                {TIPOS.map((t) => (
                  <option key={t.tipo} value={t.tipo}>
                    {t.etiqueta}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="btn ghost"
              onClick={() => setVersion((v) => v + 1)}
              disabled={cargando}
              aria-label="Volver a consultar los registros"
            >
              <RefreshCw size={16} /> {cargando ? 'Consultando...' : 'Actualizar'}
            </button>
          </div>

          {error ? (
            <p className="error">{error}</p>
          ) : cargando ? (
            <p className="lead">Consultando registros...</p>
          ) : registros.length === 0 ? (
            <p className="lead">No hay registros de este tipo para la persona.</p>
          ) : (
            <div className="tablewrap">
              <table className="tabla">
                <thead>
                  <tr>
                    <th>Fecha y hora</th>
                    {def.columnas.map((c) => {
                      const falla = c.campo ? fallas[c.campo] : undefined;
                      if (!c.campo || !falla) return <th key={c.titulo}>{c.titulo}</th>;
                      const aviso = avisoSinDatos(c.campo, falla);
                      return (
                        <th key={c.titulo} className="th-sin-datos" title={aviso}>
                          <span tabIndex={0} aria-label={aviso}>
                            <AlertTriangle size={14} aria-hidden="true" /> {c.titulo}
                          </span>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {registros.map((r) => {
                    const nuevo = esNuevo(r, vistoHasta);
                    return (
                      <tr key={r.id} className={nuevo ? 'registro-nuevo' : undefined}>
                        <td>
                          {fmtHora(r.time)}
                          {nuevo && <span className="chip-nuevo">Nuevo</span>}
                        </td>
                        {def.columnas.map((c) => (
                          <td key={c.titulo}>{c.valor(r.datos)}</td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
      <div className="card-foot">
        Se consulta al cambiar la persona o el tipo de dato, y sola cada{' '}
        {tipo === 'ambiental_reading' ? `${INTERVALO_ESP32_S} s` : '30 s'}.{' '}
        {tipo === 'ambiental_reading' &&
          `Una variable en rojo lleva ${MUESTRAS_SIN_DATO} muestras seguidas sin llegar; pasa el cursor para ver desde cuándo. `}
        {TIPOS_CON_NUEVOS.has(tipo) && 'En verde, lo que llegó desde la última vez que miraste. '}
        Las gráficas se siguen calculando una vez al día.
      </div>
    </div>
  );
};
