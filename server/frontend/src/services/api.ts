const API_BASE = import.meta.env.VITE_API_URL || '';

// El token vive en memoria y en sessionStorage (se borra al cerrar la pestaña).
// No se usa localStorage, no se escribe en logs ni en la URL.
const CLAVE_TOKEN = 'rwd_token';
let authToken: string | null = null;

try {
  authToken = sessionStorage.getItem(CLAVE_TOKEN);
  // Limpieza de restos de la versión anterior, que guardaba todo en localStorage.
  localStorage.removeItem('rwd_token');
  localStorage.removeItem('rwd_user');
} catch {
  authToken = null;
}

export function setToken(token: string | null) {
  authToken = token;
  try {
    if (token) sessionStorage.setItem(CLAVE_TOKEN, token);
    else sessionStorage.removeItem(CLAVE_TOKEN);
  } catch {
    /* sessionStorage no disponible: el token queda solo en memoria */
  }
}

export function getToken(): string | null {
  return authToken;
}

// Error tipado de la API. `codigo` y `detalles` vienen del cuerpo de la respuesta.
export class ApiError extends Error {
  status: number;
  codigo?: string;
  detalles?: string[];

  constructor(status: number, mensaje: string, codigo?: string, detalles?: string[]) {
    super(mensaje);
    this.name = 'ApiError';
    this.status = status;
    this.codigo = codigo;
    this.detalles = detalles;
  }
}

// El AuthContext registra aquí qué hacer ante 401 y ante 403 debe_cambiar_clave.
interface ManejadoresSesion {
  onSesionInvalida: () => void;
  onDebeCambiarClave: () => void;
}

let manejadores: ManejadoresSesion | null = null;

export function registrarManejadoresSesion(m: ManejadoresSesion | null) {
  manejadores = m;
}

interface OpcionesApi {
  // false en login y cambio de clave: ahí un 401 significa "credenciales
  // incorrectas", no "sesión vencida", y se muestra en el formulario.
  manejarSesion?: boolean;
}

export async function api<T = unknown>(
  ruta: string,
  opciones: RequestInit = {},
  { manejarSesion = true }: OpcionesApi = {},
): Promise<T> {
  const headers = new Headers(opciones.headers || {});

  if (!headers.has('Content-Type') && !(opciones.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }
  if (authToken) {
    headers.set('Authorization', `Bearer ${authToken}`);
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${ruta}`, { ...opciones, headers });
  } catch {
    throw new ApiError(0, 'No se pudo conectar con el servidor. Revisa tu conexión.');
  }

  const data = await response.json().catch(() => ({}));

  if (response.ok) return data as T;

  const codigo: string | undefined = data?.codigo;
  const detalles: string[] | undefined = Array.isArray(data?.detalles) ? data.detalles : undefined;

  if (response.status === 401 && manejarSesion) {
    manejadores?.onSesionInvalida();
    throw new ApiError(401, 'Tu sesión venció. Inicia sesión de nuevo.', codigo);
  }

  if (response.status === 403 && codigo === 'debe_cambiar_clave') {
    manejadores?.onDebeCambiarClave();
    throw new ApiError(403, 'Debes cambiar tu clave temporal antes de continuar.', codigo);
  }

  if (response.status === 403) {
    throw new ApiError(403, 'No tienes permiso para ver esto.', codigo);
  }

  if (response.status === 429) {
    throw new ApiError(429, 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.', codigo);
  }

  throw new ApiError(
    response.status,
    data?.error || `Error ${response.status}: ${response.statusText}`,
    codigo,
    detalles,
  );
}
