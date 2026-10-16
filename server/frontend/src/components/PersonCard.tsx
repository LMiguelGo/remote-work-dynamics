import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { IntegranteEquipo } from '../types';
import { iniciales } from '../utils/helpers';
import { SpaceDims } from './SpaceDims';

interface PersonCardProps {
  integrante: IntegranteEquipo;
}

export const PersonCard: React.FC<PersonCardProps> = ({ integrante }) => {
  const [open, setOpen] = useState(false);
  const flags = (integrante.banderas || []).length;
  const c = integrante.contexto || {};
  const u = integrante.usuario || { id: '', nombre: 'Integrante', arquetipo: 'equipo' };
  const dims = integrante.dimensiones || { S: 0, P: 0, A: 0, C: 0, E: 0 };

  return (
    <div className={`person ${open ? 'open' : ''}`}>
      <div className="person-top" onClick={() => setOpen(!open)}>
        <div className="ava">{iniciales(u.nombre)}</div>
        <div className="id">
          <b>{u.nombre}</b>
          <span>{u.arquetipo || 'equipo'}</span>
        </div>
        <div className="right">
          {flags ? (
            <span className="chip warn">{flags} para revisar</span>
          ) : (
            <span className="chip ok">sin alertas</span>
          )}
          <span className="score">
            {integrante.compuesto ?? 0}
            <small>/100</small>
          </span>
          <span className="chev">
            <ChevronDown size={18} />
          </span>
        </div>
      </div>

      {open && (
        <div className="person-detail">
          <SpaceDims dimensiones={dims} />
          <div className="ctx">
            Contexto, no puntúa: temperatura {c.temperatura ?? '—'} °C, conexión{' '}
            {c.calidad_conexion ?? '—'}/100, tiempo extralaboral{' '}
            {c.extralaboral_pct == null
              ? '—'
              : `${c.extralaboral_pct > 0 ? '+' : ''}${c.extralaboral_pct}%`}
            . Cobertura: {integrante.cobertura ?? 0}/5 dimensiones con datos.
          </div>
          {(integrante.banderas || []).map((b, idx) => (
            <div key={idx} className="pregunta">
              {b}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
