import React from 'react';
import { useApp } from '../context/AppContext';

export function StatusBar({ llmStatus, activeConnection }) {
  const { cloudActive, setCloudActive } = useApp();

  return (
    <div style={{
      height: 28,
      background: 'var(--bg-1)',
      borderTop: '1px solid var(--border)',
      display: 'flex',
      alignItems: 'center',
      padding: '0 12px',
      gap: 16,
      flexShrink: 0,
      fontSize: 11,
      color: 'var(--text-2)',
    }}>
      {/* LLM model indicator */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <div className={`status-dot ${llmStatus?.model_available ? 'connected' : 'disconnected'}`} />
        <span style={{ fontFamily: 'var(--mono)' }}>
          {llmStatus?.model_available
            ? llmStatus.model
            : llmStatus?.active_model_key
              ? `${llmStatus.active_model_key} (not downloaded)`
              : 'No model loaded'}
        </span>
        {llmStatus?.model_available && (
          <span style={{ color: 'var(--text-2)' }}>
            • {llmStatus.backend === 'local' ? 'Local' : 'Cloud'}
          </span>
        )}
      </div>

      <div style={{ width: 1, height: 14, background: 'var(--border)' }} />

      {/* Active connection */}
      <span>{activeConnection?.name || 'No connection'}</span>

      <div style={{ flex: 1 }} />

      {/* Cloud toggle */}
      <button
        onClick={() => setCloudActive((v) => !v)}
        style={{
          padding: '2px 8px', borderRadius: 3,
          border: cloudActive ? '1px solid rgba(251,191,36,0.4)' : '1px solid var(--border)',
          background: cloudActive ? 'rgba(251,191,36,0.08)' : 'transparent',
          color: cloudActive ? 'var(--yellow)' : 'var(--text-2)',
          cursor: 'pointer', fontSize: 10, fontFamily: 'var(--sans)',
          transition: 'all 0.15s',
        }}
      >
        {cloudActive ? '☁ Cloud: ON' : '☁ Cloud: OFF'}
      </button>
    </div>
  );
}
