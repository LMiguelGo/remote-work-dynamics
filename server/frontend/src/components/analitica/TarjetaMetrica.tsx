import React from 'react';
import type { MetricaDetalle } from '../../types';
import { SemaphoreChip } from '../SemaphoreChip';
import {
  ESTADO_TEXTO,
  fechaLarga,
  formatearValor,
  nivelDeEstado,
  rangoFechas,
  textoMejor,
} from '../../utils/analitica';
import { GraficaMetrica } from './GraficaMetrica';

interface Props {
  metrica: MetricaDetalle;
  referencia: string;
  dias: number;
  semanas: number;
}

// Una métrica: su valor más reciente, su nivel de criticidad y su historial dibujado.
export const TarjetaMetrica: React.FC<Props> = ({ metrica, referencia, dias, semanas }) => {
  const ultimo = metrica.ultimo;
  const semanal = metrica.frecuencia === 'semanal';

  let nota: string;
  if (!ultimo) {
    nota = '';
  } else if (semanal) {
    nota = `Semana del ${rangoFechas(ultimo.start_date, ultimo.end_date)} · una barra por semana`;
  } else {
    nota = `${ultimo.start_date === referencia ? 'Dato del último día' : `Último dato: ${fechaLarga(ultimo.start_date)}`} · una muestra por día con datos`;
  }

  return (
    <div className="an-mcard">
      <div className="an-mtop">
        <div>
          <div className="an-mnombre">{metrica.nombre}</div>
          <div className="an-mcodigo">
            {metrica.metric_name} · {textoMejor(metrica.mejor)}
          </div>
        </div>
        {ultimo && (
          <div className="an-mvalor">
            <div className="an-mgrande">{formatearValor(metrica, ultimo.raw_value)}</div>
            <SemaphoreChip
              level={nivelDeEstado(ultimo.criticality)}
              text={ultimo.criticality ? ESTADO_TEXTO[ultimo.criticality] : 'Sin dato'}
            />
          </div>
        )}
      </div>

      <GraficaMetrica metrica={metrica} referencia={referencia} dias={dias} semanas={semanas} />

      {metrica.umbrales_relativos && (
        <p className="an-nota">
          Su puntaje compara este valor con el promedio de sus sprints anteriores: óptimo hasta{' '}
          {metrica.umbrales_relativos.optimo_hasta_pct} % de diferencia y precaución hasta{' '}
          {metrica.umbrales_relativos.precaucion_hasta_pct} %.
        </p>
      )}
      {nota && <p className="an-nota">{nota}</p>}
    </div>
  );
};
