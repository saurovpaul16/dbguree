import React from 'react';
import { ProgressBar } from './ui/ProgressBar';
import { useIndexingStatus } from '../hooks/useIndexingStatus';

export function KnowledgeGraphItem({ connection }) {
  const indexing = useIndexingStatus(connection?.id);

  const icon = {
    idle:        '○',
    in_progress: '◌',
    complete:    '◉',
    error:       '⚠',
  }[indexing.status] || '○';

  const iconColor = {
    idle:        'var(--text-2)',
    in_progress: 'var(--accent)',
    complete:    'var(--green)',
    error:       'var(--red)',
  }[indexing.status] || 'var(--text-2)';

  return (
    <div style={{ padding: '6px 10px 8px', borderBottom: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        <span style={{ color: iconColor, fontSize: 12 }}>{icon}</span>
        <span style={{ fontSize: 11, color: 'var(--text-1)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {connection?.name}
        </span>
        {indexing.status === 'complete' && (
          <span style={{ fontSize: 10, color: 'var(--green)' }}>Ready</span>
        )}
      </div>

      {indexing.status === 'in_progress' && (
        <div>
          <ProgressBar value={indexing.progress_pct} label={indexing.message} showPercent />
        </div>
      )}
      {indexing.status === 'error' && (
        <div style={{ fontSize: 10, color: 'var(--red)', marginTop: 2 }} title={indexing.message}>
          {indexing.message?.slice(0, 60) || 'Indexing failed'}
        </div>
      )}
    </div>
  );
}
