import React, { useState } from 'react';
import { api } from '../services/api';
import { rolTexto } from '../utils/helpers';
import type { Role } from '../types';

const ROLES: Role[] = ['empleado', 'lider', 'gerente', 'admin'];

interface ClaveTemporal {
  id: number;
  username: string;
  rol?: Role;
  clave_temporal: string;
  aviso: string;
}

export const AdminView: React.FC = () => {
  // Crear cuenta
  const [username, setUsername] = useState('');
  const [fullName, setFullName] = useState('');
  const [rol, setRol] = useState<Role>('empleado');
  const [teamId, setTeamId] = useState('');
  // Restablecer clave
  const [idReset, setIdReset] = useState('');

  // Cuentas creadas en esta sesión: la API no tiene un listado de usuarios, así que
  // se recuerda el ID de cada una para poder restablecer su clave sin buscarlo.
  const [creadas, setCreadas] = useState<Array<{ id: number; username: string }>>([]);

  const [resultado, setResultado] = useState<ClaveTemporal | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  const ejecutar = async (peticion: () => Promise<ClaveTemporal>) => {
    setError(null);
    setResultado(null);
    setCargando(true);
    try {
      setResultado(await peticion());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo completar la acción');
    } finally {
      setCargando(false);
    }
  };

  const crear = (e: React.FormEvent) => {
    e.preventDefault();
    const cuerpo: Record<string, unknown> = { username: username.trim(), rol };
    if (fullName.trim()) cuerpo.full_name = fullName.trim();
    if (teamId.trim()) cuerpo.team_id = Number(teamId);
    void ejecutar(async () => {
      const r = await api<ClaveTemporal>('/api/usuarios', {
        method: 'POST',
        body: JSON.stringify(cuerpo),
      });
      setCreadas((prev) => [{ id: r.id, username: r.username }, ...prev]);
      setUsername('');
      setFullName('');
      setTeamId('');
      return r;
    });
  };

  const restablecerPorId = (id: number) =>
    ejecutar(() => api<ClaveTemporal>(`/api/usuarios/${id}/restablecer-clave`, { method: 'POST' }));

  const restablecer = (e: React.FormEvent) => {
    e.preventDefault();
    void restablecerPorId(Number(idReset));
  };

  return (
    <>
      <div className="card" style={{ marginBottom: 16 }}>
        <h3 className="card-title">Crear cuenta</h3>
        <form onSubmit={crear}>
          <div className="field">
            <label htmlFor="adm-username">Usuario</label>
            <input id="adm-username" value={username} onChange={(e) => setUsername(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="adm-nombre">Nombre completo</label>
            <input id="adm-nombre" value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="adm-rol">Rol</label>
            <select id="adm-rol" value={rol} onChange={(e) => setRol(e.target.value as Role)}>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {rolTexto(r)}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="adm-team">ID del equipo (opcional)</label>
            <input
              id="adm-team"
              inputMode="numeric"
              value={teamId}
              onChange={(e) => setTeamId(e.target.value.replace(/\D/g, ''))}
            />
          </div>
          <button type="submit" className="btn solid" disabled={cargando || !username.trim()}>
            Crear cuenta
          </button>
        </form>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h3 className="card-title">Restablecer clave</h3>
        <form onSubmit={restablecer}>
          <div className="field">
            <label htmlFor="adm-id">ID numérico de la cuenta</label>
            <input
              id="adm-id"
              inputMode="numeric"
              value={idReset}
              onChange={(e) => setIdReset(e.target.value.replace(/\D/g, ''))}
            />
          </div>
          <button type="submit" className="btn solid" disabled={cargando || !idReset}>
            Generar clave temporal
          </button>
        </form>
        {creadas.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <div className="section-label">Cuentas creadas en esta sesión</div>
            <ul style={{ listStyle: 'none', padding: 0 }}>
              {creadas.map((c) => (
                <li key={c.id} style={{ marginBottom: 8 }}>
                  <b>{c.username}</b> · ID {c.id}{' '}
                  <button
                    type="button"
                    className="btn ghost"
                    disabled={cargando}
                    onClick={() => void restablecerPorId(c.id)}
                  >
                    Restablecer clave
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {error && <p className="error">{error}</p>}

      {resultado && (
        <div className="card">
          <h3 className="card-title">
            Clave temporal de {resultado.username} (ID {resultado.id})
          </h3>
          <p>
            <code style={{ userSelect: 'all', fontSize: '1.1em' }}>{resultado.clave_temporal}</code>
          </p>
          <p className="hint">
            {resultado.aviso} Se muestra una sola vez: si cierras o generas otra, no se puede volver
            a ver.
          </p>
        </div>
      )}
    </>
  );
};
