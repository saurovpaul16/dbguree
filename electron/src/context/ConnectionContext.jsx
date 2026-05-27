import React, { createContext, useContext } from 'react';
import { useConnections } from '../hooks/useConnections';

const ConnectionContext = createContext(null);

export function ConnectionProvider({ children }) {
  const connectionState = useConnections();
  return (
    <ConnectionContext.Provider value={connectionState}>
      {children}
    </ConnectionContext.Provider>
  );
}

export function useConnectionContext() {
  const ctx = useContext(ConnectionContext);
  if (!ctx) throw new Error('useConnectionContext must be used inside ConnectionProvider');
  return ctx;
}
