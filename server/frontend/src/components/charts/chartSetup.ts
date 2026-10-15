import ChartJS, { type Plugin } from 'chart.js/auto';

export interface AlertBand {
  from: number;
  to: number;
  color: string;
}

export const bandasAlertaPlugin: Plugin = {
  id: 'bandasAlerta',
  beforeDraw(chart, _args, opts: { bands?: AlertBand[] }) {
    const bands = opts && opts.bands;
    if (!bands || !bands.length) return;
    const y = chart.scales.y;
    const area = chart.chartArea;
    if (!y || !area) return;
    const ctx = chart.ctx;
    ctx.save();
    for (const b of bands) {
      const yTo = y.getPixelForValue(Math.min(b.to, y.max));
      const yFrom = y.getPixelForValue(Math.max(b.from, y.min));
      ctx.fillStyle = b.color;
      ctx.fillRect(area.left, yTo, area.right - area.left, yFrom - yTo);
    }
    ctx.restore();
  },
};

// Registrar plugin de franjas y defaults globales de Chart.js
ChartJS.register(bandasAlertaPlugin);
ChartJS.defaults.font.family = "'Plus Jakarta Sans', system-ui, sans-serif";
ChartJS.defaults.color = '#5b6475';

export function setupChartDefaults() {
  // Auto-registrado
}

export { ChartJS };

export const CHART_COLORS = {
  blue: '#2f6bed',
  green: '#16a34a',
  amber: '#f59e0b',
  red: '#ef4444',
  grid: 'rgba(17,24,39,.07)',
};
