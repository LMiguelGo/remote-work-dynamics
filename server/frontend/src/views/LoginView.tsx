import React, { useState } from 'react';
import { Shield } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export const LoginView: React.FC = () => {
  const { login, aviso } = useAuth();
  const [username, setUsername] = useState('');
  const [clave, setClave] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

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
            <input
              id="login-usuario"
              type="text"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
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
        {error && (
          <p className="error" role="alert" style={{ color: 'var(--red)', margin: '10px 0 0' }}>
            {error}
          </p>
        )}
      </div>
    </div>
  );
};
