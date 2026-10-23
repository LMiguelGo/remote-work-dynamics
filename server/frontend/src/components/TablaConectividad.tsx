import React from 'react';
import type { FuenteRed, SemaphoreLevel } from '../types';
import { SemaphoreChip } from './SemaphoreChip';
import { fmtHora } from '../utils/helpers';

function nivel(estado: string): SemaphoreLevel {
  return estado === 'con datos' ? 'ok' : 'none';
}

function num(v: number | null | undefined, decimales = 0): string {
  return v == null ? '—' : v.toFixed(decimales);
}

function nombre(d: { username: string | null; full_name: string | null }): string {
  return d.full_name?.trim() || d.username || 'Sin asignar';
}

interface Props {
  fuentes: FuenteRed[];
  vacio?: string;
}

// Última medición de red e interrupciones por fuente (datos de solo lectura).
export const TablaConectividad: React.FC<Props> = ({
  fuentes,
  vacio = 'No hay fuentes de red registradas.',
}) => {
  if (fuentes.length === 0) {
    return <p className="lead">{vacio}</p>;
  }

  return (
    <div className="tablewrap">
      <table className="tabla">
        <thead>
          <tr>
            <th>Fuente</th>
            <th>Estado</th>
            <th>Latencia (ms)</th>
            <th>Bajada (Mbps)</th>
            <th>Subida (Mbps)</th>
            <th>Pérdida (%)</th>
            <th>Interrupciones</th>
            <th>Medición</th>
          </tr>
        </thead>
        <tbody>
          {fuentes.map((f) => (
            <tr key={f.id}>
              <td>
                <b>{nombre(f.dueno)}</b>
                <div className="card-foot">{f.identifier}</div>
              </td>
              <td>
                <SemaphoreChip level={nivel(f.estado)} text={f.estado} />
              </td>
              <td>{num(f.qos?.latency_ms)}</td>
              <td>{num(f.qos?.download_speed_mbps, 1)}</td>
              <td>{num(f.qos?.upload_speed_mbps, 1)}</td>
              <td>{num(f.qos?.packet_loss_percentage, 1)}</td>
              <td>
                {f.interrupcion
                  ? `${num(f.interrupcion.interruption_count)} (${num(
                      f.interrupcion.interruption_duration_seconds,
                    )} s)`
                  : '—'}
              </td>
              <td>{fmtHora(f.qos?.time ?? f.interrupcion?.time)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
