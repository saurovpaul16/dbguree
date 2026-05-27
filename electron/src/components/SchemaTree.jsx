import React, { useState } from 'react';

function ColumnRow({ col }) {
  const badges = [];
  if (col.primary_key) badges.push({ label: 'PK', color: 'var(--yellow)' });
  if (col.foreign_key) badges.push({ label: 'FK', color: 'var(--cyan)' });

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 4, padding: '3px 8px 3px 28px',
      fontSize: 11, color: 'var(--text-2)',
    }}>
      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'var(--mono)' }}>
        {col.name}
      </span>
      <span style={{ fontSize: 10, color: 'var(--text-2)', fontFamily: 'var(--mono)', flexShrink: 0 }}>
        {col.type}
      </span>
      {badges.map((b) => (
        <span key={b.label} style={{
          fontSize: 9, padding: '0 4px', borderRadius: 3,
          background: `${b.color}20`, color: b.color, fontFamily: 'var(--mono)',
        }}>
          {b.label}
        </span>
      ))}
    </div>
  );
}

function TableRow({ table }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <div
        onClick={() => setOpen((v) => !v)}
        style={{
          display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px',
          cursor: 'pointer', transition: 'background 0.1s', borderRadius: 3, margin: '1px 4px',
          userSelect: 'none',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-3)')}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
      >
        <span style={{ fontSize: 8, color: 'var(--text-2)', width: 10, textAlign: 'center', transition: 'transform 0.15s', transform: open ? 'rotate(0deg)' : 'rotate(-90deg)', display: 'inline-block' }}>
          ▾
        </span>
        <span style={{ fontSize: 13 }}>▤</span>
        <span style={{ fontSize: 12, color: 'var(--text-1)', flex: 1, fontFamily: 'var(--mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {table.name}
        </span>
        <span style={{ fontSize: 9, padding: '0 4px', borderRadius: 3, background: 'var(--bg-4)', color: 'var(--text-2)', fontFamily: 'var(--mono)' }}>
          {table.columns?.length || 0}
        </span>
      </div>
      {open && table.columns?.map((col) => (
        <ColumnRow key={col.name} col={col} />
      ))}
    </div>
  );
}

export function SchemaTree({ schema }) {
  const [filter, setFilter] = useState('');

  if (!schema?.tables?.length) {
    return (
      <div style={{ padding: '12px 10px', fontSize: 11, color: 'var(--text-2)' }}>
        No schema data. Connect and wait for indexing.
      </div>
    );
  }

  const tables = schema.tables.filter((t) =>
    !filter || t.name.toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '6px 8px', borderBottom: '1px solid var(--border)' }}>
        <input
          className="input-field"
          placeholder="Filter tables..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          style={{ fontSize: 11 }}
        />
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
        {tables.map((t) => <TableRow key={t.name} table={t} />)}
        {tables.length === 0 && (
          <div style={{ padding: '8px 12px', fontSize: 11, color: 'var(--text-2)' }}>
            No tables match "{filter}"
          </div>
        )}
      </div>
    </div>
  );
}
