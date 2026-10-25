import type { SemaphoreLevel } from '../types';

export const SEM_LABEL: Record<SemaphoreLevel, string> = {
  ok: 'Óptimo',
  warn: 'Precaución',
  bad: 'Crítico',
  none: 'Sin dato',
};

export function iniciales(nombre?: string | null): string {
  if (!nombre) return '—';
  const partes = nombre.trim().split(/\s+/).filter(Boolean);
  if (!partes.length) return '—';
  return partes
    .slice(0, 2)
    .map((p) => (p && p[0] ? p[0] : ''))
    .join('')
    .toUpperCase() || '—';
}

export function rolTexto(rol: string): string {
  switch (rol) {
    case 'admin':
      return 'Administrador del sistema';
    case 'gerente':
      return 'Gerente';
    case 'lider':
      return 'Líder de equipo';
    case 'empleado':
      return 'Empleado';
    default:
      return rol;
  }
}

// Nombre para mostrar de un usuario de la sesión: full_name o, si no hay, username.
export function nombreUsuario(u: { username: string; full_name: string | null }): string {
  return u.full_name?.trim() || u.username;
}

export function nivelPuntaje(v: number | null | undefined): SemaphoreLevel {
  if (v == null) return 'none';
  if (v >= 75) return 'ok';
  if (v >= 50) return 'warn';
  return 'bad';
}

export function nivelTemperatura(t: number | null | undefined): SemaphoreLevel {
  if (t == null) return 'none';
  if (t >= 20 && t <= 24) return 'ok';
  if (t >= 18 && t <= 26) return 'warn';
  return 'bad';
}

export function nivelConexion(c: number | null | undefined): SemaphoreLevel {
  if (c == null) return 'none';
  if (c >= 70) return 'ok';
  if (c >= 55) return 'warn';
  return 'bad';
}

export function nivelExtralaboral(p: number | null | undefined): SemaphoreLevel {
  if (p == null) return 'none';
  if (p <= 5) return 'ok';
  if (p <= 15) return 'warn';
  return 'bad';
}

export function nivelHumedad(h: number | null | undefined): SemaphoreLevel {
  if (h == null) return 'none';
  if (h >= 40 && h <= 60) return 'ok';
  if (h >= 30 && h <= 70) return 'warn';
  return 'bad';
}

export function nivelRuido(r: number | null | undefined): SemaphoreLevel {
  if (r == null) return 'none';
  if (r < 50) return 'ok';
  if (r <= 65) return 'warn';
  return 'bad';
}

export function colorPuntaje(v: number): string {
  if (v >= 75) return 'var(--green)';
  if (v >= 50) return 'var(--blue)';
  return 'var(--amber)';
}

export function fmtHora(ts: string | null | undefined): string {
  if (!ts) return '—';
  const d = new Date(ts);
  return isNaN(d.getTime()) ? ts : d.toLocaleString();
}
