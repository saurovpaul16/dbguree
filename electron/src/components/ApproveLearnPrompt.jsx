import React, { useState } from 'react';

/**
 * Post-execution "Approve & Learn" prompt.
 * Shown in the results footer when originated_from_ai=true. [FR-QRY-08]
 */
export function ApproveLearnPrompt({ onApprove, onSkip }) {
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const handleApprove = async () => {
    setLoading(true);
    await onApprove();
    setLoading(false);
    setDone(true);
  };

  if (done) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px',
        borderTop: '1px solid var(--border)', fontSize: 11, color: 'var(--green)',
      }}>
        ✓ Query learned
      </div>
    );
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px',
      borderTop: '1px solid var(--border)', background: 'var(--bg-1)',
    }}>
      <span style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 500 }}>✦ Approve &amp; Learn</span>
      <span style={{ fontSize: 11, color: 'var(--text-2)', flex: 1 }}>
        Save this query to the knowledge graph?
      </span>
      <button
        onClick={handleApprove}
        disabled={loading}
        style={{
          padding: '3px 10px', borderRadius: 4, border: '1px solid var(--accent)',
          background: 'var(--accent-glow)', color: 'var(--accent)', fontSize: 11,
          cursor: loading ? 'not-allowed' : 'pointer', fontFamily: 'var(--sans)',
          opacity: loading ? 0.6 : 1,
        }}
      >
        {loading ? '...' : '✓ Approve'}
      </button>
      <button
        onClick={onSkip}
        style={{
          padding: '3px 10px', borderRadius: 4, border: '1px solid var(--border)',
          background: 'transparent', color: 'var(--text-2)', fontSize: 11,
          cursor: 'pointer', fontFamily: 'var(--sans)',
        }}
      >
        Skip
      </button>
    </div>
  );
}
