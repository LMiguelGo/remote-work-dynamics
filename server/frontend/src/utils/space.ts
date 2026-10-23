import type { DimensionAnalisis, DimensionKey, IntegranteLider, SemaphoreLevel } from '../types';

// La criticidad la calcula la analítica; aquí solo se traduce a color.
export function nivelCriticidad(estado: string | null | undefined): SemaphoreLevel {
  switch (estado) {
    case 'optimo':
      return 'ok';
    case 'precaucion':
      return 'warn';
    case 'critico':
      return 'bad';
    default:
      return 'none';
  }
}

// Escala 0-10 con un decimal; null significa "sin dato", nunca 0.
export function fmtPuntaje(v: number | null | undefined): string {
  return v == null ? '—' : v.toFixed(1);
}

export function dimensionDe(i: IntegranteLider, d: DimensionKey): DimensionAnalisis | undefined {
  return i.dimensiones.find((x) => x.dimension === d);
}

// Cuántas dimensiones de un integrante están en estado crítico.
export function contarCriticos(i: IntegranteLider): number {
  return i.dimensiones.filter((d) => d.criticality_status === 'critico').length;
}
