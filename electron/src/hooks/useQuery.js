import { useCallback, useRef, useState } from 'react';
import { apiClient } from './useApi';

let _tabCounter = 1;

function createTab(sql = '') {
  return { id: `tab-${_tabCounter++}`, label: `Query ${_tabCounter - 1}`, sql };
}

/**
 * Query tabs, SQL execution, results management.
 * "Push to Edit" and "Move to Query Window" entry points are here.
 */
export function useQuery({ onRevealQueryPanel } = {}) {
  const [tabs, setTabs] = useState([createTab()]);
  const [activeTabId, setActiveTabId] = useState(tabs[0].id);
  const [results, setResults] = useState(null);  // QueryExecuteResponse
  const [dbMessages, setDbMessages] = useState([]);
  const [isExecuting, setIsExecuting] = useState(false);
  const [pendingConfirmation, setPendingConfirmation] = useState(null); // {sql, operations, connectionId, sessionId, messageId}
  const [originatedMessageId, setOriginatedMessageId] = useState(null);
  const lastExecutedRef = useRef(null);

  const addTab = useCallback((sql = '') => {
    const tab = createTab(sql);
    setTabs((prev) => [...prev, tab]);
    setActiveTabId(tab.id);
    return tab.id;
  }, []);

  const closeTab = useCallback((tabId) => {
    setTabs((prev) => {
      if (prev.length === 1) return prev; // Always keep at least one
      const next = prev.filter((t) => t.id !== tabId);
      if (activeTabId === tabId) {
        setActiveTabId(next[next.length - 1].id);
      }
      return next;
    });
  }, [activeTabId]);

  const updateTabSql = useCallback((tabId, sql) => {
    setTabs((prev) =>
      prev.map((t) => (t.id === tabId ? { ...t, sql } : t))
    );
  }, []);

  /**
   * "Push to Edit" from SqlBlock. [TR-10]
   * 4 states:
   * 1. Active tab exists → paste into it
   * 2. No active tab but panel visible → create new tab
   * 3. Query panel hidden → reveal it, create new tab
   */
  const pushSqlToTab = useCallback((sql) => {
    const existingTab = tabs.find((t) => t.id === activeTabId);
    if (existingTab) {
      updateTabSql(activeTabId, sql);
    } else {
      const newId = addTab(sql);
      setActiveTabId(newId);
    }
    // If panel hidden, reveal it
    onRevealQueryPanel?.();
  }, [tabs, activeTabId, updateTabSql, addTab, onRevealQueryPanel]);

  const executeQuery = useCallback(async ({
    connectionId,
    sql,
    sessionId,
    messageId,
    confirmed = false,
  }) => {
    setIsExecuting(true);
    setDbMessages([]);
    console.log('[useQuery] Executing query:', { connectionId, sql: sql.substring(0, 50), sessionId });

    const { data, error } = await apiClient.post('/query/execute', {
      connection_id: connectionId,
      sql,
      session_id: sessionId,
      message_id: messageId,
      confirmed,
    });

    console.log('[useQuery] Response:', { data, error });
    setIsExecuting(false);

    if (error) {
      console.error('[useQuery] Error:', error);
      setDbMessages([{ type: 'error', text: error, time: new Date().toLocaleTimeString() }]);
      return { data: null, error };
    }

    if (data && data.require_confirmation) {
      setPendingConfirmation({ sql, operations: data.operations, connectionId, sessionId, messageId });
      return { data, error: null };
    }

    if (data) {
      console.log('[useQuery] Setting results:', data.row_count, 'rows');
      setResults(data);
      if (messageId) setOriginatedMessageId(messageId);
      lastExecutedRef.current = { sql, connectionId, sessionId };
      setDbMessages([{
        type: 'success',
        text: `Query executed — ${data.row_count} rows in ${data.execution_time_ms}ms`,
        time: new Date().toLocaleTimeString(),
      }]);
    }
    return { data, error: null };
  }, []);

  const confirmDestructive = useCallback(async () => {
    if (!pendingConfirmation) return;
    const { sql, connectionId, sessionId, messageId } = pendingConfirmation;
    setPendingConfirmation(null);
    return executeQuery({ connectionId, sql, sessionId, messageId, confirmed: true });
  }, [pendingConfirmation, executeQuery]);

  const exportCsv = useCallback(() => {
    if (!results) return;
    const { columns, rows } = results;
    const csv = [
      columns.join(','),
      ...rows.map((row) =>
        row.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')
      ),
    ].join('\n');
    const a = document.createElement('a');
    a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
    a.download = 'query_result.csv';
    a.click();
  }, [results]);

  const clearApprovePrompt = useCallback(() => {
    setOriginatedMessageId(null);
  }, []);

  return {
    tabs,
    activeTabId,
    results,
    dbMessages,
    isExecuting,
    pendingConfirmation,
    originatedMessageId,
    addTab,
    closeTab,
    setActiveTabId,
    updateTabSql,
    pushSqlToTab,
    executeQuery,
    confirmDestructive,
    cancelPendingConfirmation: () => setPendingConfirmation(null),
    exportCsv,
    clearApprovePrompt,
  };
}
