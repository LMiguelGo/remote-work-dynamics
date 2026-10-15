import React, { useEffect, useRef } from 'react';
import { ChartJS, CHART_COLORS, type AlertBand } from './chartSetup';

interface PointData {
  ts: string;
  valor: number;
}

interface BandChartProps {
  label: string;
  points?: PointData[];
  bands?: AlertBand[];
  color: string;
  minY?: number;
  maxY?: number;
}

export const BandChart: React.FC<BandChartProps> = ({
  label,
  points = [],
  bands = [],
  color,
  minY = 0,
  maxY = 100,
}) => {
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

    const labels = points.map((p) => (p.ts || '').slice(11, 16));
    const dataVals = points.map((p) => p.valor);

    chartRef.current = new ChartJS(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label,
            data: dataVals,
            borderColor: color,
            backgroundColor: color,
            tension: 0.25,
            pointRadius: 0,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            grid: { display: false },
            ticks: { maxTicksLimit: 8 },
          },
          y: {
            min: minY,
            max: maxY,
            grid: { color: CHART_COLORS.grid },
          },
        },
        plugins: {
          legend: { display: true },
          // @ts-expect-error custom plugin option
          bandasAlerta: { bands },
        },
      },
    });

    return () => {
      chartRef.current?.destroy();
      chartRef.current = null;
    };
  }, [points, bands, color, label, minY, maxY]);

  return (
    <div className="chart-box">
      <canvas ref={canvasRef} />
    </div>
  );
};
