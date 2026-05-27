import React from 'react';
import { useApp } from '../context/AppContext';

export function TitleBar({ activeConnection }) {
  const { cloudActive } = useApp();

  const dotClass = activeConnection?.status === 'connected' ? 'connected'
    : activeConnection?.status === 'error' ? 'error'
    : 'disconnected';

  return (
    <div style={{
      height: 40,
      background: 'var(--bg-1)',
      borderBottom: '1px solid var(--border)',
      display: 'flex',
      alignItems: 'center',
      padding: '0 16px',
      gap: 12,
      flexShrink: 0,
      userSelect: 'none',
      WebkitAppRegion: 'drag',
    }}>
      {/* Logo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, WebkitAppRegion: 'no-drag' }}>
        <div style={{
          width: 22, height: 22, borderRadius: 5,
          background: 'linear-gradient(135deg, var(--accent), #7c3aed)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 11, color: '#fff', fontWeight: 700,
        }}>
          dG
        </div>
        <span style={{ fontFamily: 'var(--mono)', fontWeight: 600, fontSize: 14, color: 'var(--accent)', letterSpacing: '-0.5px' }}>
          DBGuree
        </span>
      </div>

      <div style={{ flex: 1 }} />

      {/* Active connection badge */}
      {activeConnection && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px',
          borderRadius: 4, background: 'var(--bg-3)', border: '1px solid var(--border)',
          fontSize: 11, color: 'var(--text-1)', WebkitAppRegion: 'no-drag',
        }}>
          <div className={`status-dot ${dotClass}`} />
          {activeConnection.name}
        </div>
      )}

      {/* Cloud active indicator [FR-CHAT-09] */}
      {cloudActive && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 5, padding: '3px 8px',
          borderRadius: 4, background: 'rgba(251,191,36,0.1)',
          border: '1px solid rgba(251,191,36,0.3)',
          fontSize: 11, color: 'var(--yellow)', WebkitAppRegion: 'no-drag',
        }}>
          ☁ Cloud Active
        </div>
      )}
    </div>
  );
}
