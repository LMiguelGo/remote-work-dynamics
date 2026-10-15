import React, { useId } from 'react';

interface SparklineProps {
  values?: number[];
}

export const Sparkline: React.FC<SparklineProps> = ({ values = [] }) => {
  const gradientId = useId();
  let v = Array.isArray(values) ? values.slice() : [];
  if (v.length < 2) v = v.length ? [v[0], v[0]] : [0, 0];
  
  const w = 100;
  const h = 40;
  const pad = 4;
  const min = Math.min(...v);
  const max = Math.max(...v);
  const span = max - min || 1;

  const pts = v.map((n, i) => [
    pad + (i * (w - 2 * pad)) / (v.length - 1),
    h - pad - ((n - min) / span) * (h - 2 * pad),
  ]);

  const line = pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  const area = `${pad},${h - pad} ${line} ${w - pad},${h - pad}`;
  const last = pts[pts.length - 1];

  return (
    <svg className="spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="rgba(47,107,237,.2)" />
          <stop offset="1" stopColor="rgba(47,107,237,0)" />
        </linearGradient>
      </defs>
      <polygon points={area} fill={`url(#${gradientId})`} />
      <polyline
        points={line}
        fill="none"
        stroke="var(--blue)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      <circle
        cx={last[0].toFixed(1)}
        cy={last[1].toFixed(1)}
        r="2.4"
        fill="var(--blue)"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
};
