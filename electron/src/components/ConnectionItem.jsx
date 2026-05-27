import React from 'react';

const DB_TYPE_COLORS = {
  postgresql: { bg: '#1e3a5f', color: '#4f9cf9', label: 'PG' },
  mysql:      { bg: '#1e3d2f', color: '#3dd68c', label: 'MY' },
  mssql:      { bg: '#3d1e3a', color: '#c084fc', label: 'MS' },
};

export function ConnectionItem({ connection, isActive, status, onClick }) {
  const typeStyle = DB_TYPE_COLORS[connection.db_type] || DB_TYPE_COLORS.postgresql;
  const dotClass = status?.status
    ? `status-dot ${status.status}`
    : 'status-dot disconnected';

  return (
    <div
      className={`conn-item${isActive ? ' active' : ''}`}
      onClick={onClick}
      title={`${connection.host}:${connection.port}/${connection.database}`}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '7px 10px',
        borderRadius: 5,
        cursor: 'pointer',
        transition: 'all 0.15s',
        background: isActive ? 'var(--bg-4)' : 'transparent',
        marginBottom: 2,
      }}
    >
      <div
        style={{
          width: 22,
          height: 22,
          borderRadius: 4,
          background: typeStyle.bg,
          color: typeStyle.color,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 9,
          fontFamily: 'var(--mono)',
          fontWeight: 700,
          flexShrink: 0,
        }}
      >
        {typeStyle.label}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, color: 'var(--text-0)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {connection.name}
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {connection.host}:{connection.port}
        </div>
      </div>

      <div className={dotClass} />
    </div>
  );
}
