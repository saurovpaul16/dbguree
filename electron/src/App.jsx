import React, { useEffect, useRef, useState } from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { ConnectionProvider } from './context/ConnectionContext';
import { ChatProvider } from './context/ChatContext';
import { TitleBar } from './layout/TitleBar';
import { Sidebar } from './layout/Sidebar';
import { StatusBar } from './layout/StatusBar';
import { ChatPanel } from './panels/ChatPanel';
import { QueryPanel } from './panels/QueryPanel';
import { HistoryPanel } from './panels/HistoryPanel';
import { RagPanel } from './panels/RagPanel';
import { SettingsPanel } from './panels/SettingsPanel';
import { useConnectionContext } from './context/ConnectionContext';
import { useChatContext } from './context/ChatContext';
import { useSystemInfo } from './hooks/useSystemInfo';

/** Notification toast renderer */
function Notifications() {
  const { notifications } = useApp();
  return (
    <div style={{ position: 'fixed', bottom: 40, right: 16, zIndex: 9999, display: 'flex', flexDirection: 'column', gap: 6 }}>
      {notifications.map((n) => (
        <div key={n.id} className={`notification notification-${n.type}`}>
          {n.type === 'success' ? '✓' : n.type === 'error' ? '✕' : 'ℹ'} {n.message}
        </div>
      ))}
    </div>
  );
}

/** Icon bar for switching panels */
function IconBar({ activePanel, setActivePanel }) {
  const icons = [
    { id: 'chat',     icon: '✦', title: 'AI Assistant' },
    { id: 'history',  icon: '⏱', title: 'Chat History' },
    { id: 'rag',      icon: '◈', title: 'Knowledge Graph' },
    { id: 'settings', icon: '⚙', title: 'Settings' },
  ];
  return (
    <div style={{
      width: 44, background: 'var(--bg-1)', borderRight: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '8px 0', gap: 4, flexShrink: 0,
    }}>
      {icons.map((item) => (
        <button
          key={item.id}
          title={item.title}
          onClick={() => setActivePanel(item.id)}
          style={{
            width: 32, height: 32, borderRadius: 6, border: 'none',
            background: activePanel === item.id ? 'var(--bg-4)' : 'transparent',
            color: activePanel === item.id ? 'var(--accent)' : 'var(--text-2)',
            cursor: 'pointer', fontSize: 15, display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'all 0.15s',
          }}
        >
          {item.icon}
        </button>
      ))}
    </div>
  );
}

function MainWorkspace() {
  const { activePanel, setActivePanel, activeConnectionId, setActiveConnectionId, setBackendReady } = useApp();
  const { connections } = useConnectionContext();
  const { activeSession } = useChatContext();
  const { llmStatus } = useSystemInfo();

  const queryPanelPushRef = useRef(null);

  // Listen for backend-ready event from Electron main process.
  // In browser / dev-server mode (window.api is absent), skip straight to ready
  // — the backend port is provided via window.__DBGUREE_PORT (set by dev-server).
  useEffect(() => {
    if (window.api) {
      window.api.onBackendReady?.((data) => {
        window.__DBGUREE_PORT = data?.port;
        setBackendReady(true);
      });
    } else {
      // Browser / dev-server mode: backend is already running; just mark ready.
      setBackendReady(true);
    }
  }, [setBackendReady]);

  // Auto-select first connection if none selected
  useEffect(() => {
    if (connections.length > 0 && !activeConnectionId) {
      setActiveConnectionId(connections[0].id);
    }
  }, [connections, activeConnectionId, setActiveConnectionId]);

  const activeConnection = connections.find((c) => c.id === activeConnectionId);

  const handlePushToEdit = (sql) => {
    queryPanelPushRef.current?.(sql);
    setActivePanel('chat'); // keep focus in chat after push
  };

  const handleMoveToQuery = (sql) => {
    queryPanelPushRef.current?.(sql);
  };

  const leftPanel = {
    chat:     <ChatPanel connectionId={activeConnectionId} onPushToEdit={handlePushToEdit} onMoveToQuery={handleMoveToQuery} />,
    history:  <HistoryPanel />,
    rag:      <RagPanel connectionId={activeConnectionId} />,
    settings: <SettingsPanel />,
  }[activePanel];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      <TitleBar activeConnection={activeConnection} />

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <IconBar activePanel={activePanel} setActivePanel={setActivePanel} />
        <Sidebar />

        {/* Left panel (chat / history / rag / settings) */}
        <div style={{ width: 380, minWidth: 280, maxWidth: 500, borderRight: '1px solid var(--border)', flexShrink: 0 }}>
          {leftPanel}
        </div>

        {/* Right panel (query editor + results) */}
        <QueryPanel
          connectionId={activeConnectionId}
          connectionProfile={activeConnection}
          activeSessionId={activeSession?.id}
          revealRef={queryPanelPushRef}
        />
      </div>

      <StatusBar llmStatus={llmStatus} activeConnection={activeConnection} />
      <Notifications />
    </div>
  );
}

function BackendLoadingOverlay() {
  const { backendReady } = useApp();
  if (backendReady) return null;
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 99999,
      background: 'var(--bg-0, #0d0f14)',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 16,
    }}>
      <div style={{ fontSize: 28, color: 'var(--accent, #7c6af7)', letterSpacing: 2 }}>dG</div>
      <div style={{ fontSize: 13, color: 'var(--text-2, #888)' }}>Starting backend…</div>
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <ConnectionProvider>
        <ChatProvider>
          <BackendLoadingOverlay />
          <MainWorkspace />
        </ChatProvider>
      </ConnectionProvider>
    </AppProvider>
  );
}
