import React, { useState, useEffect } from 'react';
import { Shield } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { nombreUsuario, rolTexto } from '../utils/helpers';
import type { UsuarioDemo } from '../types';

export const LoginView: React.FC = () => {
  const { login, aviso } = useAuth();
  // /api/usuarios-demo solo existe en desarrollo. En producción responde 404 y
  // el login queda como un campo de texto normal.
  const [usuariosDemo, setUsuariosDemo] = useState<UsuarioDemo[]>([]);
  const [username, setUsername] = useState('');
  const [clave, setClave] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    api<UsuarioDemo[]>('/api/usuarios-demo', {}, { manejarSesion: false })
      .then((lista) => {
        setUsuariosDemo(lista);
        if (lista.length > 0) setUsername(lista[0].username);
      })
      .catch(() => {
        // Sin lista de demo: se escribe el usuario a mano. No es un error.
        setUsuariosDemo([]);
      });
  }, []);

  const handleLogin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!username.trim() || !clave) return;
    setError(null);
    setCargando(true);
    try {
      await login(username.trim(), clave);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al iniciar sesión');
    } finally {
      setCargando(false);
    }
  };

  const hayDemo = usuariosDemo.length > 0;

  return (
    <div className="login-wrap">
      <div className="login">
        <div className="mark">
          <Shield size={22} strokeWidth={2.4} />
        </div>
        <h1>Espacio laboral</h1>
        <p>Análisis de dinámicas de trabajo remoto. Inicia sesión con tu usuario y tu clave.</p>

        <form onSubmit={handleLogin}>
          <div className="field">
            <label htmlFor="login-usuario">Usuario</label>
            {hayDemo ? (
              <select
                id="login-usuario"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              >
                {usuariosDemo.map((u) => (
                  <option key={u.username} value={u.username}>
                    {nombreUsuario(u)} ({u.username}) — {rolTexto(u.role_name)}
                  </option>
                ))}
              </select>
            ) : (
              <input
                id="login-usuario"
                type="text"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            )}
          </div>

          <div className="field">
            <label htmlFor="login-clave">Clave</label>
            <input
              id="login-clave"
              type="password"
              autoComplete="current-password"
              value={clave}
              onChange={(e) => setClave(e.target.value)}
            />
          </div>

          <button type="submit" className="btn solid" disabled={cargando || !username.trim() || !clave}>
            {cargando ? 'Entrando...' : 'Entrar'}
          </button>
        </form>

        {aviso && !error && <p className="hint">{aviso}</p>}
        {error && <p className="error">{error}</p>}
        {hayDemo && (
          <p className="hint">
            Modo demostración: cada usuario tiene su propia clave, generada por el seed en{' '}
            <code>server/backend/.seed-credenciales.txt</code>.
          </p>
        )}
      </div>
    </div>
  );
};
