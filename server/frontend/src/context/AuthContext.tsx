import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { Usuario } from '../types';
import { api, getToken, registrarManejadoresSesion, setToken } from '../services/api';

interface RespuestaLogin {
  token: string;
  usuario: Usuario;
  debe_cambiar_clave: boolean;
}

interface AuthContextType {
  user: Usuario | null;
  debeCambiarClave: boolean;
  // Mensaje para mostrar en el login (p. ej. "tu sesión venció").
  aviso: string | null;
  isLoading: boolean;
  login: (username: string, clave: string) => Promise<Usuario>;
  cambiarClave: (claveActual: string, claveNueva: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const CLAVE_USUARIO = 'rwd_user';

// El JWT lleva { id, rol, mc }. Se lee `mc` solo para saber si hay que pedir
// el cambio de clave tras recargar la página. La validez la decide el backend.
function mustChangeDelToken(token: string | null): boolean {
  if (!token) return false;
  try {
    const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(base64)).mc === true;
  } catch {
    return false;
  }
}

function leerUsuarioGuardado(): Usuario | null {
  if (!getToken()) return null;
  try {
    const saved = sessionStorage.getItem(CLAVE_USUARIO);
    return saved ? (JSON.parse(saved) as Usuario) : null;
  } catch {
    return null;
  }
}

function guardarUsuario(u: Usuario | null) {
  try {
    if (u) sessionStorage.setItem(CLAVE_USUARIO, JSON.stringify(u));
    else sessionStorage.removeItem(CLAVE_USUARIO);
  } catch {
    /* sin sessionStorage: se pierde al recargar */
  }
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<Usuario | null>(leerUsuarioGuardado);
  const [debeCambiarClave, setDebeCambiarClave] = useState<boolean>(() =>
    mustChangeDelToken(getToken()),
  );
  const [aviso, setAviso] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const cerrarSesion = useCallback((mensaje: string | null) => {
    setToken(null);
    guardarUsuario(null);
    setUser(null);
    setDebeCambiarClave(false);
    setAviso(mensaje);
  }, []);

  const logout = useCallback(() => cerrarSesion(null), [cerrarSesion]);

  // 401 en cualquier llamada protegida -> vuelve al login.
  // 403 debe_cambiar_clave -> pantalla de cambio de clave.
  useEffect(() => {
    registrarManejadoresSesion({
      onSesionInvalida: () => cerrarSesion('Tu sesión venció. Inicia sesión de nuevo.'),
      onDebeCambiarClave: () => setDebeCambiarClave(true),
    });
    return () => registrarManejadoresSesion(null);
  }, [cerrarSesion]);

  const login = useCallback(async (username: string, clave: string): Promise<Usuario> => {
    setIsLoading(true);
    try {
      const res = await api<RespuestaLogin>(
        '/api/login',
        { method: 'POST', body: JSON.stringify({ username, clave }) },
        { manejarSesion: false },
      );
      setToken(res.token);
      guardarUsuario(res.usuario);
      setUser(res.usuario);
      setDebeCambiarClave(res.debe_cambiar_clave === true);
      setAviso(null);
      return res.usuario;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const cambiarClave = useCallback(async (claveActual: string, claveNueva: string) => {
    setIsLoading(true);
    try {
      const res = await api<{ ok: boolean; token: string }>(
        '/api/cambiar-clave',
        {
          method: 'POST',
          body: JSON.stringify({ clave_actual: claveActual, clave_nueva: claveNueva }),
        },
        { manejarSesion: false },
      );
      // El token nuevo reemplaza al anterior (ya sin la marca de cambio obligatorio).
      setToken(res.token);
      setDebeCambiarClave(false);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const value = useMemo(
    () => ({ user, debeCambiarClave, aviso, isLoading, login, cambiarClave, logout }),
    [user, debeCambiarClave, aviso, isLoading, login, cambiarClave, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
};
