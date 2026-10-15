import React, { useState, useEffect } from 'react';
import { Shield } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { rolTexto } from '../utils/helpers';
import type { User } from '../types';

export const LoginView: React.FC = () => {
  const { login } = useAuth();
  const [usuariosDemo, setUsuariosDemo] = useState<User[]>([]);
  const [selectedUser, setSelectedUser] = useState('');
  const [clave, setClave] = useState('demo123');
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    api<User[]>('/api/usuarios-demo')
      .then((lista) => {
        setUsuariosDemo(lista);
        if (lista.length > 0) {
          setSelectedUser(lista[0].nombre);
        }
      })
      .catch(() => {
        setError('¿Sembraste los datos con npm run seed?');
      });
  }, []);

  const handleLogin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!selectedUser) return;
    setError(null);
    setCargando(true);
    try {
      await login(selectedUser, clave);
    } catch (err: any) {
      setError(err.message || 'Error al iniciar sesión');
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
        <p>
          Análisis de dinámicas de trabajo remoto. Escoge un usuario para ver qué muestra el sistema
          según su rol.
        </p>

        <form onSubmit={handleLogin}>
          <div className="field">
            <label>Usuario</label>
            <select
              value={selectedUser}
              onChange={(e) => setSelectedUser(e.target.value)}
              disabled={usuariosDemo.length === 0}
            >
              {usuariosDemo.map((u) => (
                <option key={u.id} value={u.nombre}>
                  {u.nombre} — {rolTexto(u.rol)}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label>Clave</label>
            <input
              type="password"
              value={clave}
              onChange={(e) => setClave(e.target.value)}
            />
          </div>

          <button type="submit" className="btn solid" disabled={cargando}>
            {cargando ? 'Entrando...' : 'Entrar'}
          </button>
        </form>

        {error && <p className="error">{error}</p>}
        <p className="hint">
          Clave de la demostración: <code>demo123</code>
        </p>
      </div>
    </div>
  );
};
