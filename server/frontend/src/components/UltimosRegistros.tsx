import React, { useEffect, useState } from 'react';
import { Database, RefreshCw } from 'lucide-react';
import { api } from '../services/api';
import type { RegistroReciente, RespuestaRegistros, TipoRegistro } from '../types';
import { fmtHora } from '../utils/helpers';

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
      { titulo: 'Temperatura (°C)', valor: (d) => numero(d.temperature, 1) },
      { titulo: 'Humedad (%)', valor: (d) => numero(d.humidity, 1) },
      { titulo: 'Ruido (dB)', valor: (d) => numero(d.noise_level, 1) },
    ],
  },
  {
    tipo: 'pull_request',
    etiqueta: 'Pull requests',
    columnas: [
      { titulo: 'PR', valor: (d) => (d.pr_number == null ? '—' : `#${d.pr_number}`) },
      { titulo: 'Acción', valor: (d) => ACCION_PR[String(d.action)] ?? texto(d.action) },
      { titulo: 'Líneas (+/−)', valor: (d) => `+${numero(d.lines_added)} / −${numero(d.lines_deleted)}` },
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
}

interface Props {
  personas: PersonaRegistros[];
  rutaBase: '/api/equipo/integrantes' | '/api/organizacion/integrantes';
  id?: string;
  indice?: number;
}

// Tarjeta de últimos registros: la persona y el tipo de dato se eligen con dos selectores y cada cambio vuelve a
// consultar la base. No escucha eventos en vivo. Sirve para comprobar que cada fuente está guardando datos.
export const UltimosRegistros: React.FC<Props> = ({ personas, rutaBase, id, indice = 0 }) => {
  const [personaElegida, setPersonaElegida] = useState<number | null>(null);
  const [tipo, setTipo] = useState<TipoRegistro>('working_session');
  // Sube con el botón Actualizar para repetir la misma consulta.
  const [version, setVersion] = useState(0);
  const [resultado, setResultado] = useState<Resultado | null>(null);

  // Si la persona elegida ya no está en la lista (o aún no se eligió), se toma la primera.
  const personaId = personas.some((p) => p.id === personaElegida)
    ? personaElegida
    : (personas[0]?.id ?? null);
  const clave = `${personaId}|${tipo}|${version}`;

  // Cada cambio de persona, tipo o el botón Actualizar consulta la base. Si llega una respuesta de una consulta
  // anterior, se descarta.
  useEffect(() => {
    if (personaId == null) return;
    let vigente = true;
    api<RespuestaRegistros>(`${rutaBase}/${personaId}/registros?tipo=${encodeURIComponent(tipo)}`)
      .then((respuesta) => {
        if (vigente) setResultado({ clave, respuesta, error: null });
      })
      .catch((err: unknown) => {
        // 401 y debe_cambiar_clave ya los resuelve AuthContext.
        if (vigente) {
          setResultado({
            clave,
            respuesta: null,
            error: err instanceof Error ? err.message : 'No se pudieron cargar los registros',
          });
        }
      });
    return () => {
      vigente = false;
    };
  }, [clave, personaId, tipo, rutaBase]);

  const cargando = personaId != null && resultado?.clave !== clave;
  const respuesta = cargando ? null : (resultado?.respuesta ?? null);
  const error = cargando ? null : (resultado?.error ?? null);
  const def = TIPOS.find((t) => t.tipo === tipo) ?? TIPOS[0];
  const grupos = Array.from(new Set(personas.map((p) => p.grupo ?? '')));
  const registros = respuesta?.tipo === tipo ? respuesta.registros : [];

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
                    {def.columnas.map((c) => (
                      <th key={c.titulo}>{c.titulo}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {registros.map((r) => (
                    <tr key={r.id}>
                      <td>{fmtHora(r.time)}</td>
                      {def.columnas.map((c) => (
                        <td key={c.titulo}>{c.valor(r.datos)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
      <div className="card-foot">
        Se consulta cada vez que cambias la persona o el tipo de dato. Las gráficas se siguen calculando una vez al día.
      </div>
    </div>
  );
};
