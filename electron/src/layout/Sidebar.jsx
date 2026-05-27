import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { useConnectionContext } from '../context/ConnectionContext';
import { ConnectionItem } from '../components/ConnectionItem';
import { ConnectionForm } from '../components/ConnectionForm';
import { KnowledgeGraphItem } from '../components/KnowledgeGraphItem';

function SectionHeader({ label, icon, collapsed, onToggle, onAdd }) {
  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 5, padding: '7px 10px 7px 8px',
        cursor: 'pointer', position: 'sticky', top: 0, zIndex: 2, background: 'var(--bg-1)',
        borderBottom: '1px solid var(--border)',
      }}
      onClick={onToggle}
    >
      <span style={{ fontSize: 8, color: 'var(--text-2)', width: 10, textAlign: 'center', transition: 'transform 0.15s', display: 'inline-block', transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }}>▾</span>
      <span style={{ fontSize: 13 }}>{icon}</span>
      <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-1)', flex: 1, letterSpacing: 0.2, textTransform: 'uppercase', fontSize: 10 }}>{label}</span>
      {onAdd && (
        <button
          onClick={(e) => { e.stopPropagation(); onAdd(); }}
          style={{ width: 18, height: 18, fontSize: 13, background: 'none', border: 'none', color: 'var(--text-2)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 3, transition: 'all 0.15s' }}
          title="Add connection"
        >+</button>
      )}
    </div>
  );
}

export function Sidebar() {
  const { activeConnectionId, setActiveConnectionId } = useApp();
  const { connections, createConnection, deleteConnection, testConnection, connectToDb } = useConnectionContext();

  const [dbCollapsed, setDbCollapsed] = useState(false);
  const [kgCollapsed, setKgCollapsed] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [connectionStatuses, setConnectionStatuses] = useState({});

  const handleConnect = async (id) => {
    setActiveConnectionId(id);
    const { data } = await connectToDb(id);
    if (data?.status) {
      setConnectionStatuses((prev) => ({ ...prev, [id]: { status: data.status } }));
    }
  };

  const handleSave = async (form) => {
    return await createConnection(form);
  };

  const handleTest = async (form) => {
    // Temporary test — connection not saved yet
    // Create a temporary profile ID for testing
    return { success: false, error: 'Use "Save" then "Test" on saved connections.' };
  };

  return (
    <div style={{
      width: 260, minWidth: 200, maxWidth: 360,
      background: 'var(--bg-1)', borderRight: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{ height: 36, display: 'flex', alignItems: 'center', padding: '0 10px 0 14px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-2)', letterSpacing: '0.8px', textTransform: 'uppercase', flex: 1 }}>Explorer</span>
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {/* DATABASE INSTANCES */}
        <div style={{ borderBottom: '1px solid var(--border)' }}>
          <SectionHeader
            label="Database Instances"
            icon="🗄"
            collapsed={dbCollapsed}
            onToggle={() => setDbCollapsed((v) => !v)}
            onAdd={() => setFormOpen(true)}
          />
          {!dbCollapsed && (
            <div style={{ padding: 6 }}>
              {connections.map((conn) => (
                <ConnectionItem
                  key={conn.id}
                  connection={conn}
                  isActive={activeConnectionId === conn.id}
                  status={connectionStatuses[conn.id]}
                  onClick={() => handleConnect(conn.id)}
                />
              ))}
              <button
                onClick={() => setFormOpen(true)}
                style={{
                  width: '100%', padding: '7px 10px', borderRadius: 5,
                  border: '1px dashed var(--border-bright)', background: 'transparent',
                  color: 'var(--text-2)', fontSize: 11, fontFamily: 'var(--sans)',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                  transition: 'all 0.15s', marginTop: 4,
                }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border-bright)'; e.currentTarget.style.color = 'var(--text-2)'; }}
              >
                + Add Connection
              </button>
            </div>
          )}
        </div>

        {/* KNOWLEDGE GRAPH */}
        <div>
          <SectionHeader
            label="Knowledge Graph"
            icon="◈"
            collapsed={kgCollapsed}
            onToggle={() => setKgCollapsed((v) => !v)}
          />
          {!kgCollapsed && (
            <div>
              {connections.length === 0 && (
                <div style={{ padding: '10px 12px', fontSize: 11, color: 'var(--text-2)' }}>
                  Connect to a database to build the knowledge graph.
                </div>
              )}
              {connections.map((conn) => (
                <KnowledgeGraphItem key={conn.id} connection={conn} />
              ))}
            </div>
          )}
        </div>
      </div>

      <ConnectionForm
        isOpen={formOpen}
        onClose={() => setFormOpen(false)}
        onSave={handleSave}
        onTest={handleTest}
      />
    </div>
  );
}
