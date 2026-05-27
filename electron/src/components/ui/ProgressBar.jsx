import React from 'react';

export function ProgressBar({ value = 0, label, showPercent = true }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {(label || showPercent) && (
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-2)' }}>
          {label && <span>{label}</span>}
          {showPercent && <span>{pct}%</span>}
        </div>
      )}
      <div className="progress-bar">
        <div className="progress-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
