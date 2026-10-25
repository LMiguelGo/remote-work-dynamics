import type {
  CorrelacionMetricas,
  EstadoCorrelacion,
  EstadoCriticidad,
  MetricaDetalle,
  SemaphoreLevel,
} from '../types';

// ---- Fechas ----
// El backend entrega fechas de calendario 'AAAA-MM-DD'. Se trabaja siempre en UTC al mediodía para que la zona horaria
// del navegador no corra un día.

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

export function msDe(iso: string): number {
  return Date.parse(`${iso.slice(0, 10)}T12:00:00Z`);
}

export function sumarDias(iso: string, n: number): string {
  return new Date(msDe(iso) + n * 86400000).toISOString().slice(0, 10);
}

export function fechaCorta(iso: string): string {
  const d = new Date(msDe(iso));
  return `${d.getUTCDate()} ${MESES[d.getUTCMonth()]}`;
}

export function fechaLarga(iso: string): string {
  const d = new Date(msDe(iso));
  return `${DIAS[d.getUTCDay()]} ${d.getUTCDate()} ${MESES[d.getUTCMonth()]}`;
}

export function rangoFechas(inicio: string, fin: string): string {
  return inicio === fin ? fechaLarga(inicio) : `${fechaCorta(inicio)} al ${fechaCorta(fin)}`;
}

// ---- Criticidad ----

export const ESTADO_TEXTO: Record<EstadoCriticidad, string> = {
  optimo: 'Óptimo',
  precaucion: 'Precaución',
  critico: 'Crítico',
};

export const COLOR_ESTADO: Record<EstadoCriticidad, string> = {
  optimo: 'var(--green)',
  precaucion: 'var(--amber)',
  critico: 'var(--red)',
};

export function nivelDeEstado(e: EstadoCriticidad | null | undefined): SemaphoreLevel {
  if (e === 'optimo') return 'ok';
  if (e === 'precaucion') return 'warn';
  if (e === 'critico') return 'bad';
  return 'none';
}

// Banda del puntaje 0-10, la misma para métricas y dimensiones. Solo etiqueta un promedio que no trae su propio estado.
export function estadoDePuntaje(p: number): EstadoCriticidad {
  return p >= 8 ? 'optimo' : p >= 6 ? 'precaucion' : 'critico';
}

// ---- Valores ----

export function formatearValor(
  m: Pick<MetricaDetalle, 'formato' | 'decimales' | 'mejor'>,
  v: number | null | undefined,
): string {
  if (v == null) return '—';
  if (m.mejor === 'letra') return 'EDCBA'[Math.round(v) - 1] ?? '—';
  return m.formato.replace('{v}', v.toFixed(m.decimales));
}

export function textoMejor(mejor: MetricaDetalle['mejor']): string {
  switch (mejor) {
    case 'menos':
      return 'menos es mejor';
    case 'mas':
      return 'más es mejor';
    case 'rango':
      return 'dentro del rango es mejor';
    case 'letra':
      return 'A es lo mejor';
    default:
      return 'se compara con sus sprints anteriores';
  }
}

// ---- Correlaciones ----

export const ESTADO_CORRELACION: Record<EstadoCorrelacion, { texto: string; clase: string }> = {
  diagnostico: { texto: 'Diagnóstico', clase: 'diagnostico' },
  patron_distinto: { texto: 'Patrón distinto', clase: 'distinto' },
  no_significativa: { texto: 'No significativa', clase: 'tenue' },
  datos_insuficientes: { texto: 'Datos insuficientes', clase: 'tenue' },
};

const PRIORIDAD: Record<EstadoCorrelacion, number> = {
  diagnostico: 0,
  patron_distinto: 1,
  no_significativa: 2,
  datos_insuficientes: 3,
};

// Primero las que dicen algo; dentro de cada estado, por número de relación.
export function ordenarCorrelaciones(filas: CorrelacionMetricas[]): CorrelacionMetricas[] {
  const peso = (c: CorrelacionMetricas) => PRIORIDAD[c.estado] ?? 4;
  return [...filas].sort((a, b) => peso(a) - peso(b) || a.id - b.id);
}
