import React, { useState } from 'react';
import { Shield } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { ApiError } from '../services/api';

// Espejo de la política del backend (utils/password.js) solo para avisar antes.
// La validación que manda es la del servidor.
const LONGITUD_MINIMA = 12;
const LONGITUD_MAXIMA = 64;
const SUBCADENAS_PROHIBIDAS = [
  'password', 'contrasena', 'contraseña', 'qwerty', '123456', 'iloveyou',
  'welcome', 'letmein', 'abc123', 'admin', 'bienvenido',
];

function esTrivial(clave: string): boolean {
  const minus = clave.toLowerCase();
  if (/^(.)\1+$/.test(clave)) return true;
  return SUBCADENAS_PROHIBIDAS.some((s) => minus.includes(s));
}

export const CambiarClaveView: React.FC = () => {
  const { cambiarClave, logout, user, isLoading } = useAuth();
  const [actual, setActual] = useState('');
  const [nueva, setNueva] = useState('');
  const [confirmar, setConfirmar] = useState('');
  const [errores, setErrores] = useState<string[]>([]);

  const largoOk = nueva.length >= LONGITUD_MINIMA && nueva.length <= LONGITUD_MAXIMA;
  const noTrivialOk = nueva.length > 0 && !esTrivial(nueva);
  const distintaOk = nueva.length > 0 && nueva !== actual;
  const coincideOk = nueva.length > 0 && nueva === confirmar;
  const puedeEnviar = actual.length > 0 && largoOk && noTrivialOk && distintaOk && coincideOk;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!puedeEnviar) return;
    setErrores([]);
    try {
      await cambiarClave(actual, nueva);
      // Al cambiarla, AuthContext quita debeCambiarClave y App muestra el panel.
    } catch (err) {
      if (err instanceof ApiError && err.status === 400 && err.detalles?.length) {
        setErrores(err.detalles);
      } else {
        setErrores([err instanceof Error ? err.message : 'No se pudo cambiar la clave']);
      }
    }
  };

  const regla = (ok: boolean, texto: string) => (
    <li style={{ opacity: nueva.length === 0 ? 0.6 : 1 }}>
      {nueva.length === 0 ? '○' : ok ? '✓' : '✗'} {texto}
    </li>
  );

  return (
    <div className="login-wrap">
      <div className="login">
        <div className="mark">
          <Shield size={22} strokeWidth={2.4} />
        </div>
        <h1>Cambia tu clave</h1>
        <p>
          {user ? `${user.full_name || user.username}, ` : ''}tu clave actual es temporal. Define una
          propia para continuar. Puede ser una frase larga.
        </p>

        <form onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="clave-actual">Clave actual (temporal)</label>
            <input
              id="clave-actual"
              type="password"
              autoComplete="current-password"
              value={actual}
              onChange={(e) => setActual(e.target.value)}
            />
          </div>

          <div className="field">
            <label htmlFor="clave-nueva">Clave nueva</label>
            <input
              id="clave-nueva"
              type="password"
              autoComplete="new-password"
              value={nueva}
              onChange={(e) => setNueva(e.target.value)}
            />
          </div>

          <div className="field">
            <label htmlFor="clave-confirmar">Repite la clave nueva</label>
            <input
              id="clave-confirmar"
              type="password"
              autoComplete="new-password"
              value={confirmar}
              onChange={(e) => setConfirmar(e.target.value)}
            />
          </div>

          <ul className="hint" style={{ listStyle: 'none', padding: 0, margin: '0 0 12px' }}>
            {regla(largoOk, `Entre ${LONGITUD_MINIMA} y ${LONGITUD_MAXIMA} caracteres`)}
            {regla(noTrivialOk, 'No es una clave común (password, admin, 123456…)')}
            {regla(distintaOk, 'Es distinta de la actual')}
            {regla(coincideOk, 'Las dos claves nuevas coinciden')}
          </ul>

          <button type="submit" className="btn solid" disabled={isLoading || !puedeEnviar}>
            {isLoading ? 'Guardando...' : 'Cambiar clave'}
          </button>
          <button type="button" className="btn ghost" onClick={logout} style={{ marginTop: 8 }}>
            Salir
          </button>
        </form>

        {errores.length > 0 && (
          <div className="error">
            {errores.map((m) => (
              <p key={m}>{m}</p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
