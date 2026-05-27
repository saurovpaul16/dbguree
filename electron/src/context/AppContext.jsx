import React, { createContext, useCallback, useContext, useState } from 'react';

const AppContext = createContext(null);

export function AppProvider({ children }) {
  const [backendReady, setBackendReady] = useState(false);
  const [activePanel, setActivePanel] = useState('chat'); // 'chat'|'history'|'rag'|'settings'
  const [activeConnectionId, setActiveConnectionId] = useState(null);
  const [queryPanelVisible, setQueryPanelVisible] = useState(true);
  const [notifications, setNotifications] = useState([]);
  const [cloudActive, setCloudActive] = useState(false);

  const notify = useCallback((type, message) => {
    const id = Date.now();
    setNotifications((prev) => [...prev, { id, type, message }]);
    setTimeout(() => {
      setNotifications((prev) => prev.filter((n) => n.id !== id));
    }, 3000);
  }, []);

  const revealQueryPanel = useCallback(() => {
    setQueryPanelVisible(true);
  }, []);

  const value = {
    backendReady,
    setBackendReady,
    activePanel,
    setActivePanel,
    activeConnectionId,
    setActiveConnectionId,
    queryPanelVisible,
    setQueryPanelVisible,
    revealQueryPanel,
    notifications,
    notify,
    cloudActive,
    setCloudActive,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}
