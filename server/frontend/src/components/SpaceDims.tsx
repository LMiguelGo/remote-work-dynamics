import React from 'react';
import { DIMN, ORDEN_DIMENSIONES, type DimensionesMap } from '../types';

interface SpaceDimsProps {
  dimensiones?: DimensionesMap;
}

export const SpaceDims: React.FC<SpaceDimsProps> = ({ dimensiones }) => {
  const dims = dimensiones || { S: 0, P: 0, A: 0, C: 0, E: 0 };

  return (
    <div className="dims">
      {ORDEN_DIMENSIONES.map((d) => {
        const val = dims[d] ?? 0;
        return (
          <div key={d} className="dim">
            <span className="lbl">{DIMN[d]}</span>
            <span className="track">
              <span className="fill" style={{ width: `${Math.min(100, Math.max(0, val))}%` }} />
            </span>
            <span className="num">{val}</span>
          </div>
        );
      })}
    </div>
  );
};
