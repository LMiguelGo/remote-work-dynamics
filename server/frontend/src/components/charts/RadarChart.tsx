import React, { useEffect, useRef } from 'react';
import { ChartJS, CHART_COLORS } from './chartSetup';
import { DIMN, ORDEN_DIMENSIONES, type DimensionesMap } from '../../types';

interface RadarChartProps {
  agregadoDimensiones?: DimensionesMap;
  // Máximo de la escala del radar. 100 por defecto; el tablero del líder usa 10.
  max?: number;
}

export const RadarChart: React.FC<RadarChartProps> = ({ agregadoDimensiones, max = 100 }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const chartRef = useRef<InstanceType<typeof ChartJS> | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;

    if (chartRef.current) {
      chartRef.current.destroy();
      chartRef.current = null;
    }

    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;

    const dims = agregadoDimensiones || { S: 0, P: 0, A: 0, C: 0, E: 0 };

    chartRef.current = new ChartJS(ctx, {
      type: 'radar',
      data: {
        labels: ORDEN_DIMENSIONES.map((d) => DIMN[d]),
        datasets: [
          {
            label: 'Equipo',
            data: ORDEN_DIMENSIONES.map((d) => dims[d] ?? 0),
            fill: true,
            backgroundColor: 'rgba(47,107,237,.15)',
            borderColor: CHART_COLORS.blue,
            pointBackgroundColor: CHART_COLORS.blue,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          r: {
            min: 0,
            max,
            ticks: { stepSize: max / 4, backdropColor: 'transparent' },
            grid: { color: CHART_COLORS.grid },
            pointLabels: { font: { size: 10 } },
          },
        },
        plugins: {
          legend: { display: false },
        },
      },
    });

    return () => {
      chartRef.current?.destroy();
      chartRef.current = null;
    };
  }, [agregadoDimensiones, max]);

  return (
    <div className="chart-box">
      <canvas ref={canvasRef} />
    </div>
  );
};
