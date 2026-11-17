import type { RegistroReciente, TipoRegistro } from '../types';

// --- Sensor ambiental sin datos ---
// El ESP32 publica una lectura cada 5 s (esp-32/src/main.cpp). Si la temperatura, la humedad o el ruido fallan, el
// firmware descarta la lectura completa y no envía nada, y a las 6 fallas seguidas se considera «detenido»
// (FALLAS_PARA_DETENER). Se usa ese mismo número: una variable está en falla si faltan 6 muestras seguidas, es decir,
// si su último valor tiene más de 6 × 5 s = 30 s. Con menos se marcarían cortes aislados de la red o del sensor.
export const INTERVALO_ESP32_S = 5;
export const MUESTRAS_SIN_DATO = 6;
export const VENTANA_SIN_DATO_S = INTERVALO_ESP32_S * MUESTRAS_SIN_DATO;

export type VariableAmbiental = 'temperature' | 'humidity' | 'noise_level';

export const NOMBRE_VARIABLE: Record<VariableAmbiental, string> = {
  temperature: 'temperatura',
  humidity: 'humedad',
  noise_level: 'ruido',
};

export interface FallaVariable {
  ultimo: string | null; // hora del último valor recibido; null si no hay ninguno entre los registros
  segundos: number | null; // segundos desde ese valor hasta `ahora`
}

// Variables que llevan al menos MUESTRAS_SIN_DATO muestras sin llegar. `registros` son los últimos que guardó la base
// (más recientes primero); `ahoraISO` es la hora del servidor. Sin registros no se marca nada: puede ser una persona
// sin sensor.
export function variablesSinDatos(
  registros: RegistroReciente[],
  ahoraISO: string,
): Partial<Record<VariableAmbiental, FallaVariable>> {
  const ahora = Date.parse(ahoraISO);
  if (registros.length === 0 || Number.isNaN(ahora)) return {};
  const fallas: Partial<Record<VariableAmbiental, FallaVariable>> = {};
  for (const v of Object.keys(NOMBRE_VARIABLE) as VariableAmbiental[]) {
    const conValor = registros.find((r) => typeof r.datos[v] === 'number' && r.time);
    const t = conValor?.time ? Date.parse(conValor.time) : NaN;
    if (Number.isNaN(t)) {
      fallas[v] = { ultimo: null, segundos: null };
      continue;
    }
    const segundos = Math.max(0, Math.round((ahora - t) / 1000));
    if (segundos > VENTANA_SIN_DATO_S) fallas[v] = { ultimo: conValor!.time, segundos };
  }
  return fallas;
}

// «45 s», «12 min», «3 h 5 min», «2 días».
export function duracion(segundos: number): string {
  if (segundos < 60) return `${segundos} s`;
  const min = Math.floor(segundos / 60);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h ${min % 60} min`;
  const dias = Math.floor(h / 24);
  return `${dias} ${dias === 1 ? 'día' : 'días'}`;
}

// --- Registros nuevos en verde ---
// En estos tipos, lo que llegó después de la última vez que esta persona miró la tarjeta se marca en verde.
export const TIPOS_CON_NUEVOS: ReadonlySet<TipoRegistro> = new Set<TipoRegistro>([
  'pull_request',
  'pull_request_review',
  'commit',
  'issue_created',
  'issue_updated',
]);

// Hora del registro más reciente, o null.
export function masReciente(registros: RegistroReciente[]): string | null {
  let max: string | null = null;
  for (const r of registros) {
    if (r.time && (max == null || Date.parse(r.time) > Date.parse(max))) max = r.time;
  }
  return max;
}

// ¿Llegó el registro después de `vistoHasta`? Sin referencia (primera vez que se mira) nada es nuevo.
export function esNuevo(r: RegistroReciente, vistoHasta: string | null): boolean {
  if (!vistoHasta || !r.time) return false;
  return Date.parse(r.time) > Date.parse(vistoHasta);
}
