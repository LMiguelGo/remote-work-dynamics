import React from 'react';

interface RingProgressProps {
  value: number | null | undefined;
  size?: number;
  color?: string;
  label?: React.ReactNode;
  sub?: string;
}

export const RingProgress: React.FC<RingProgressProps> = ({
  value = 0,
  size = 108,
  color = 'var(--blue)',
  label,
  sub,
}) => {
  const v = Math.max(0, Math.min(100, value || 0));
  const sw = size >= 100 ? 10 : 8;
  const r = (size - sw) / 2;
  const c = 2 * Math.PI * r;
  const off = c * (1 - v / 100);
  const m = size / 2;

  return (
    <div
      className={`ring${size < 100 ? ' sm' : ''}`}
      style={{ width: `${size}px`, height: `${size}px` }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={m}
          cy={m}
          r={r}
          fill="none"
          stroke="#e9edf5"
          strokeWidth={sw}
        />
        <circle
          cx={m}
          cy={m}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={sw}
          strokeLinecap="round"
          strokeDasharray={c.toFixed(1)}
          strokeDashoffset={off.toFixed(1)}
        />
      </svg>
      <div className="mid">
        {label != null && <b>{label}</b>}
        {sub && <small>{sub}</small>}
      </div>
    </div>
  );
};
