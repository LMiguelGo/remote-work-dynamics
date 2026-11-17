import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { fmtHora } from '../utils/helpers';

// Estado del recálculo que devuelve GET/PUT /api/admin/analitica/recalculo.
interface EstadoRecalculo {
  intervalo_minutos: number;
  minimo: number;
  maximo: number;
  modo: 'diario' | 'periodico';
  ultimo_recalculo: string | null;
  ultimo_error: string | null;
  proximo_recalculo: string | null;
}

const OPCIONES: Array<{ minutos: number; texto: string }> = [
  { minutos: 1, texto: 'Cada minuto' },
  { minutos: 5, texto: 'Cada 5 minutos' },
  { minutos: 15, texto: 'Cada 15 minutos' },
  { minutos: 30, texto: 'Cada 30 minutos' },
  { minutos: 60, texto: 'Cada hora' },
  { minutos: 360, texto: 'Cada 6 horas' },
  { minutos: 720, texto: 'Cada 12 horas' },
  { minutos: 1440, texto: 'Cada 24 horas (por defecto)' },
];

function textoIntervalo(min: number): string {
  if (min >= 1440) return 'cada 24 horas, solo al cierre de las 00:00';
  if (min % 60 === 0) return `cada ${min / 60} ${min === 60 ? 'hora' : 'horas'}`;
  return `cada ${min} ${min === 1 ? 'minuto' : 'minutos'}`;
}

// Tarjeta del administrador: cada cuánto recalcula la analítica las métricas del día, sus gráficas y las relaciones.
export const ConfigRecalculo: React.FC = () => {
  const [estado, setEstado] = useState<EstadoRecalculo | null>(null);
  const [minutos, setMinutos] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [guardado, setGuardado] = useState(false);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    let vigente = true;
    api<EstadoRecalculo>('/api/admin/analitica/recalculo')
      .then((e) => {
        if (!vigente) return;
        setEstado(e);
        setMinutos(String(e.intervalo_minutos));
      })
      .catch((err: unknown) => {
        if (vigente) setError(err instanceof Error ? err.message : 'No se pudo leer la configuración');
      });
    return () => {
      vigente = false;
    };
  }, []);

  const valor = Number(minutos);
  const valido = Number.isInteger(valor) && valor >= 1 && valor <= 1440;

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setGuardado(false);
    setGuardando(true);
    try {
      const nuevo = await api<EstadoRecalculo>('/api/admin/analitica/recalculo', {
        method: 'PUT',
        body: JSON.stringify({ intervalo_minutos: valor }),
      });
      setEstado(nuevo);
      setGuardado(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar');
    } finally {
      setGuardando(false);
    }
  };

  const enLista = OPCIONES.some((o) => String(o.minutos) === minutos);

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <h3 className="card-title">Recálculo de la analítica</h3>
      <p className="hint">
        Cada cuánto se recalculan las métricas del día, sus gráficas y las relaciones con los datos que hayan llegado. Con
        24 horas se calcula solo al cierre de las 00:00. Con menos, los paneles del líder y del gerente se actualizan solos
        a ese ritmo.
      </p>
      <form onSubmit={(e) => void guardar(e)}>
        <div className="field">
          <label htmlFor="adm-recalculo">Frecuencia</label>
          <select
            id="adm-recalculo"
            value={enLista ? minutos : 'otro'}
            onChange={(e) => setMinutos(e.target.value === 'otro' ? '' : e.target.value)}
          >
            {OPCIONES.map((o) => (
              <option key={o.minutos} value={String(o.minutos)}>
                {o.texto}
              </option>
            ))}
            <option value="otro">Otro (en minutos)</option>
          </select>
        </div>
        {!enLista && (
          <div className="field">
            <label htmlFor="adm-recalculo-min">Minutos (de 1 a 1440)</label>
            <input
              id="adm-recalculo-min"
              inputMode="numeric"
              value={minutos}
              onChange={(e) => setMinutos(e.target.value.replace(/\D/g, ''))}
            />
          </div>
        )}
        <button type="submit" className="btn solid" disabled={guardando || !valido}>
          {guardando ? 'Guardando...' : 'Guardar'}
        </button>
      </form>
      {estado && (
        <p className="hint" style={{ marginTop: 12 }}>
          {guardado ? 'Guardado. ' : ''}Ahora: {textoIntervalo(estado.intervalo_minutos)}.
          {estado.ultimo_recalculo ? ` Último recálculo: ${fmtHora(estado.ultimo_recalculo)}.` : ''}
          {estado.proximo_recalculo ? ` Próximo: ${fmtHora(estado.proximo_recalculo)}.` : ''}
          {estado.ultimo_error ? ` El último intento falló (${fmtHora(estado.ultimo_error)}); se reintenta en la próxima vuelta.` : ''}{' '}
          Si el servicio de analítica se reinicia, vuelve a 24 horas.
        </p>
      )}
      {error && <p className="error">{error}</p>}
    </div>
  );
};
