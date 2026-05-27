import React, { useCallback, useEffect, useRef } from 'react';
import Editor from '@monaco-editor/react';
import { AgGridReact } from 'ag-grid-react';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-alpine.css';
import { useQuery } from '../hooks/useQuery';
import { useApp } from '../context/AppContext';
import { ApproveLearnPrompt } from '../components/ApproveLearnPrompt';
import { DestructiveWarning } from '../components/DestructiveWarning';
import { usePlatform } from '../hooks/usePlatform';
import { apiClient } from '../hooks/useApi';
import { Spinner } from '../components/ui/Spinner';

export function QueryPanel({ connectionId, connectionProfile, activeSessionId, revealRef }) {
  const { notify, revealQueryPanel } = useApp();
  const { isMac, runShortcut, newTabShortcut } = usePlatform();

  const query = useQuery({ onRevealQueryPanel: revealQueryPanel });
  const {
    tabs, activeTabId, results, dbMessages, isExecuting,
    pendingConfirmation, originatedMessageId,
    addTab, closeTab, setActiveTabId, updateTabSql,
    executeQuery, confirmDestructive, cancelPendingConfirmation,
    exportCsv, clearApprovePrompt,
  } = query;

  // Expose pushSqlToTab for parent
  if (revealRef) revealRef.current = query.pushSqlToTab;

  const [activeResultTab, setActiveResultTab] = React.useState('results');

  const activeTab = tabs.find((t) => t.id === activeTabId) || tabs[0];

  const handleRun = useCallback(async () => {
    if (!connectionId || !activeTab?.sql?.trim()) return;
    await executeQuery({
      connectionId,
      sql: activeTab.sql,
      sessionId: activeSessionId || 'standalone',
    });
  }, [connectionId, activeTab, executeQuery, activeSessionId]);

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e) => {
      const mod = isMac ? e.metaKey : e.ctrlKey;
      if (mod && e.key === 'r') { e.preventDefault(); handleRun(); }
      if (mod && e.key === 't') { e.preventDefault(); addTab(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isMac, handleRun, addTab]);

  const handleApprove = async () => {
    if (!originatedMessageId || !activeSessionId || !connectionId) return;
    const msg = await apiClient.get(`/sessions/${activeSessionId}/messages`);
    const aiMsg = msg.data?.find((m) => m.id === originatedMessageId);
    if (!aiMsg?.sql_generated) return;
    const snapshot = await apiClient.get(`/connections/${connectionId}/schema`);
    const schemaHash = 'unknown'; // hash would come from indexing-status in full impl
    await apiClient.post(`/rag/${connectionId}/pairs`, {
      nl_question: '',
      sql: aiMsg.sql_generated,
      session_id: activeSessionId,
      schema_hash: schemaHash,
    });
    clearApprovePrompt();
    notify('success', 'Query saved to knowledge graph');
  };

  const colDefs = results?.columns?.map((col) => ({
    field: col,
    headerName: col,
    sortable: true,
    filter: true,
    resizable: true,
    minWidth: 80,
  })) || [];

  const rowData = results?.rows?.map((row) => {
    const obj = {};
    results.columns.forEach((col, i) => { obj[col] = row[i]; });
    return obj;
  }) || [];

  return (
    <div className="panel" style={{ flex: 1 }}>
      {/* Header */}
      <div className="panel-header">
        {/* Tabs */}
        <div style={{ display: 'flex', gap: 2, flex: 1, overflow: 'hidden' }}>
          {tabs.map((tab) => (
            <div
              key={tab.id}
              onClick={() => setActiveTabId(tab.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 5, padding: '3px 10px',
                borderRadius: '4px 4px 0 0', cursor: 'pointer', fontSize: 11,
                background: tab.id === activeTabId ? 'var(--bg-2)' : 'transparent',
                color: tab.id === activeTabId ? 'var(--text-0)' : 'var(--text-2)',
                border: tab.id === activeTabId ? '1px solid var(--border)' : '1px solid transparent',
                borderBottom: tab.id === activeTabId ? '1px solid var(--bg-2)' : '1px solid transparent',
                transition: 'all 0.15s', maxWidth: 120, whiteSpace: 'nowrap', overflow: 'hidden',
              }}
            >
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{tab.label}</span>
              <button
                onClick={(e) => { e.stopPropagation(); closeTab(tab.id); }}
                style={{ background: 'none', border: 'none', color: 'var(--text-2)', cursor: 'pointer', fontSize: 10, padding: 0, lineHeight: 1 }}
              >✕</button>
            </div>
          ))}
          <button
            onClick={() => addTab()}
            style={{ padding: '3px 8px', background: 'none', border: 'none', color: 'var(--text-2)', cursor: 'pointer', fontSize: 14, lineHeight: 1 }}
            title={`New tab (${newTabShortcut})`}
          >+</button>
        </div>

        {/* Toolbar */}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
          <button
            onClick={handleRun}
            disabled={isExecuting || !activeTab?.sql?.trim()}
            style={{
              padding: '4px 12px', borderRadius: 4, border: '1px solid var(--accent)',
              background: 'var(--accent)', color: '#fff', fontSize: 11,
              cursor: isExecuting ? 'not-allowed' : 'pointer',
              opacity: isExecuting ? 0.6 : 1, fontFamily: 'var(--sans)',
            }}
            title={`Run Query (${runShortcut})`}
          >
            {isExecuting ? '⏳ Running…' : '▶ Run'}
          </button>
          <button onClick={exportCsv} disabled={!results} style={{ padding: '4px 8px', borderRadius: 4, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-2)', fontSize: 11, cursor: results ? 'pointer' : 'not-allowed', fontFamily: 'var(--sans)' }}>CSV</button>
          {connectionProfile && (
            <span style={{ fontSize: 10, color: 'var(--text-2)', fontFamily: 'var(--mono)' }}>
              {connectionProfile.db_type} • {connectionProfile.host}
            </span>
          )}
        </div>
      </div>

      {/* Monaco Editor */}
      <div style={{ height: 240, flexShrink: 0, borderBottom: '1px solid var(--border)' }}>
        <Editor
          height="100%"
          language="sql"
          theme="vs-dark"
          value={activeTab?.sql || ''}
          onChange={(val) => updateTabSql(activeTabId, val || '')}
          options={{
            minimap: { enabled: false },
            fontSize: 13,
            fontFamily: 'JetBrains Mono, monospace',
            lineNumbers: 'on',
            wordWrap: 'on',
            automaticLayout: true,
            scrollBeyondLastLine: false,
          }}
        />
      </div>

      {/* Result area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Result tabs */}
        <div style={{ display: 'flex', gap: 1, borderBottom: '1px solid var(--border)', padding: '0 10px', flexShrink: 0 }}>
          {['results', 'messages'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveResultTab(tab)}
              style={{
                padding: '5px 12px', border: 'none', background: 'transparent',
                borderBottom: activeResultTab === tab ? '2px solid var(--accent)' : '2px solid transparent',
                color: activeResultTab === tab ? 'var(--text-0)' : 'var(--text-2)',
                fontSize: 11, cursor: 'pointer', fontFamily: 'var(--sans)',
                transition: 'all 0.15s', textTransform: 'capitalize',
              }}
            >
              {tab}
              {tab === 'messages' && dbMessages.some((m) => m.type === 'error') && (
                <span style={{ marginLeft: 4, padding: '0 4px', borderRadius: 8, background: 'var(--red)', color: '#fff', fontSize: 9 }}>!</span>
              )}
            </button>
          ))}
          {results && (
            <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-2)', alignSelf: 'center', fontFamily: 'var(--mono)' }}>
              {results.row_count} rows • {results.execution_time_ms}ms
            </span>
          )}
        </div>

        {/* Results grid */}
        <div style={{ flex: 1, overflow: 'hidden', display: activeResultTab === 'results' ? 'flex' : 'none', flexDirection: 'column' }}>
          {results ? (
            <>
              <div className="ag-theme-alpine-dark" style={{ flex: 1 }}>
                <AgGridReact
                  columnDefs={colDefs}
                  rowData={rowData}
                  defaultColDef={{ sortable: true, filter: true, resizable: true }}
                  rowHeight={28}
                  headerHeight={32}
                />
              </div>
              {results.truncated && (
                <div className="truncation-banner">
                  ⚠ Results truncated at {results.row_count} rows (connection row limit)
                </div>
              )}
            </>
          ) : (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-2)', fontSize: 12 }}>
              {isExecuting ? <Spinner /> : 'Run a query to see results'}
            </div>
          )}
        </div>

        {/* Messages tab */}
        {activeResultTab === 'messages' && (
          <div style={{ flex: 1, overflowY: 'auto', padding: '6px 10px' }}>
            {dbMessages.length === 0 ? (
              <div style={{ color: 'var(--text-2)', fontSize: 11, padding: 8 }}>No messages.</div>
            ) : (
              dbMessages.slice().reverse().map((m, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, padding: '4px 0', borderBottom: '1px solid var(--border)', alignItems: 'flex-start' }}>
                  <span style={{ fontSize: 10, color: 'var(--text-2)', fontFamily: 'var(--mono)', flexShrink: 0 }}>{m.time}</span>
                  <span style={{ fontSize: 11, color: m.type === 'error' ? 'var(--red)' : m.type === 'success' ? 'var(--green)' : 'var(--text-1)' }}>
                    {m.text}
                  </span>
                </div>
              ))
            )}
          </div>
        )}

        {/* Approve & Learn prompt */}
        {originatedMessageId && results && !results.require_confirmation && (
          <ApproveLearnPrompt onApprove={handleApprove} onSkip={clearApprovePrompt} />
        )}
      </div>

      {/* Destructive query confirmation modal */}
      <DestructiveWarning
        isOpen={!!pendingConfirmation}
        operations={pendingConfirmation?.operations || []}
        sql={pendingConfirmation?.sql || ''}
        onConfirm={confirmDestructive}
        onCancel={cancelPendingConfirmation}
      />
    </div>
  );
}
