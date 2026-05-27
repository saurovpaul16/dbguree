import React, { useState } from 'react';

/**
 * SQL code block displayed inside AI chat messages.
 * Provides "Push to Edit" and "Move to Query Window" actions. [FR-CHAT-04, FR-CHAT-10]
 */
export function SqlBlock({ sql, explanation, timestamp, onPushToEdit, onMoveToQuery }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(sql);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div style={{ marginTop: 8 }}>
      {explanation && (
        <p style={{ fontSize: 12, color: 'var(--text-1)', marginBottom: 8, lineHeight: 1.6 }}>
          {explanation}
        </p>
      )}

      <div style={{ position: 'relative', borderRadius: 4, border: '1px solid var(--border)', background: 'var(--bg-0)' }}>
        {/* Header bar */}
        <div style={{
          display: 'flex', alignItems: 'center', padding: '5px 10px',
          borderBottom: '1px solid var(--border)', gap: 6,
        }}>
          <span style={{ fontSize: 10, color: 'var(--text-2)', fontFamily: 'var(--mono)', flex: 1 }}>sql</span>
          {timestamp && (
            <span style={{ fontSize: 10, color: 'var(--text-2)' }}>{timestamp}</span>
          )}
          <button
            onClick={handleCopy}
            style={{ fontSize: 10, color: copied ? 'var(--green)' : 'var(--text-2)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px', borderRadius: 3, transition: 'color 0.15s' }}
          >
            {copied ? '✓ Copied' : 'Copy'}
          </button>
        </div>

        {/* SQL code */}
        <pre style={{
          padding: '10px 12px', fontFamily: 'var(--mono)', fontSize: 12,
          color: 'var(--text-0)', overflowX: 'auto', lineHeight: 1.6,
          margin: 0, whiteSpace: 'pre',
        }}>
          {sql}
        </pre>

        {/* Action buttons */}
        <div style={{
          display: 'flex', gap: 6, padding: '6px 10px',
          borderTop: '1px solid var(--border)',
        }}>
          <button
            onClick={() => onPushToEdit?.(sql)}
            style={{
              padding: '4px 10px', borderRadius: 4, border: '1px solid var(--border)',
              background: 'transparent', color: 'var(--accent)', fontSize: 11,
              cursor: 'pointer', fontFamily: 'var(--sans)', transition: 'all 0.15s',
            }}
            title="Copy SQL into the active query tab"
          >
            ↗ Push to Edit
          </button>
          <button
            onClick={() => onMoveToQuery?.(sql)}
            style={{
              padding: '4px 10px', borderRadius: 4, border: '1px solid var(--border)',
              background: 'transparent', color: 'var(--text-1)', fontSize: 11,
              cursor: 'pointer', fontFamily: 'var(--sans)', transition: 'all 0.15s',
            }}
            title="Move SQL to query panel and switch focus"
          >
            → Move to Query Window
          </button>
        </div>
      </div>
    </div>
  );
}
