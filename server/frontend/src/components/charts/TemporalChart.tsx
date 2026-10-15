import React, { useEffect, useRef } from 'react';
import { ChartJS, CHART_COLORS } from './chartSetup';

interface AnimoPoint {
  fecha: string;
  fatiga: number;
  enps: number;
  flujo: number;
}

interface TemporalChartProps {
  serieAnimo?: AnimoPoint[];
}

export const TemporalChart: React.FC<TemporalChartProps> = ({ serieAnimo = [] }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const chartRef = useRef<InstanceType<typeof ChartJS> | null>(null);

  useEffect(() => {
    if (!canvasRef.current || !serieAnimo.length) return;

    if (chartRef.current) {
      chartRef.current.destroy();
      chartRef.current = null;
    }

    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;

    const etiquetas = serieAnimo.map((p) => (p.fecha || '').slice(8, 10));

    chartRef.current = new ChartJS(ctx, {
      data: {
        labels: etiquetas,
        datasets: [
          {
            type: 'bar',
            label: 'Fatiga',
            data: serieAnimo.map((p) => p.fatiga),
            backgroundColor: 'rgba(239,68,68,.35)',
            borderColor: CHART_COLORS.red,
            borderWidth: 1,
            yAxisID: 'y',
          },
          {
            type: 'line',
            label: 'Ánimo (eNPS)',
            data: serieAnimo.map((p) => p.enps),
            borderColor: CHART_COLORS.green,
            backgroundColor: CHART_COLORS.green,
            tension: 0.3,
            yAxisID: 'y2',
          },
          {
            type: 'line',
            label: 'Flujo',
            data: serieAnimo.map((p) => p.flujo),
            borderColor: CHART_COLORS.blue,
            backgroundColor: CHART_COLORS.blue,
            tension: 0.3,
            yAxisID: 'y2',
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            title: { display: true, text: 'Día del período' },
            grid: { display: false },
          },
          y: {
            position: 'left',
            min: 1,
            max: 5,
            title: { display: true, text: 'Fatiga (1-5)' },
            grid: { color: CHART_COLORS.grid },
          },
          y2: {
            position: 'right',
            min: 1,
            max: 5,
            title: { display: true, text: 'Ánimo / flujo (1-5)' },
            grid: { drawOnChartArea: false },
          },
        },
      },
    });

    return () => {
      chartRef.current?.destroy();
      chartRef.current = null;
    };
  }, [serieAnimo]);

  return (
    <div className="chart-box wide">
      <canvas ref={canvasRef} />
    </div>
  );
};
