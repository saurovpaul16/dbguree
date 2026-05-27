import React, { createContext, useContext } from 'react';
import { useChat } from '../hooks/useChat';

const ChatContext = createContext(null);

export function ChatProvider({ children }) {
  const chatState = useChat();
  return (
    <ChatContext.Provider value={chatState}>
      {children}
    </ChatContext.Provider>
  );
}

export function useChatContext() {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error('useChatContext must be used inside ChatProvider');
  return ctx;
}
