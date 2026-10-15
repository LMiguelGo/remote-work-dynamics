const API_BASE = import.meta.env.VITE_API_URL || '';

let authToken: string | null = localStorage.getItem('rwd_token');

export function setToken(token: string | null) {
  authToken = token;
  if (token) {
    localStorage.setItem('rwd_token', token);
  } else {
    localStorage.removeItem('rwd_token');
  }
}

export function getToken(): string | null {
  return authToken || localStorage.getItem('rwd_token');
}

export async function api<T = any>(ruta: string, opciones: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers = new Headers(opciones.headers || {});
  
  if (!headers.has('Content-Type') && !(opciones.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }
  
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const url = `${API_BASE}${ruta}`;
  const response = await fetch(url, { ...opciones, headers });
  
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || `Error ${response.status}: ${response.statusText}`);
  }

  return data as T;
}
