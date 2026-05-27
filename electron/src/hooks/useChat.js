import { useCallback, useState } from 'react';
import { apiClient } from './useApi';

/**
 * Chat sessions + AI generation.
 * Manages session list, active session, messages, and generation state.
 */
export function useChat() {
  const [sessions, setSessions] = useState([]);
  const [activeSession, setActiveSession] = useState(null);
  const [messages, setMessages] = useState([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState(null);

  const fetchSessions = useCallback(async (connectionId) => {
    const path = connectionId ? `/sessions?connection_id=${connectionId}` : '/sessions';
    const { data, error } = await apiClient.get(path);
    if (!error) setSessions(data || []);
    return { data, error };
  }, []);

  const createSession = useCallback(async (connectionProfileId, title) => {
    const { data, error } = await apiClient.post('/sessions', {
      connection_profile_id: connectionProfileId,
      title: title || 'New Chat',
    });
    if (!error && data) {
      setSessions((prev) => [data, ...prev]);
      setActiveSession(data);
      setMessages([]);
    }
    return { data, error };
  }, []);

  const selectSession = useCallback(async (session) => {
    setActiveSession(session);
    const { data, error } = await apiClient.get(`/sessions/${session.id}/messages`);
    if (!error) setMessages(data || []);
    return { error };
  }, []);

  const deleteSession = useCallback(async (id) => {
    const { error } = await apiClient.delete(`/sessions/${id}`);
    if (!error) {
      setSessions((prev) => prev.filter((s) => s.id !== id));
      if (activeSession?.id === id) {
        setActiveSession(null);
        setMessages([]);
      }
    }
    return { error };
  }, [activeSession]);

  const sendMessage = useCallback(async (sessionId, question, connectionId) => {
    // Optimistically add user message to UI
    const tempUserMsg = {
      id: `temp-${Date.now()}`,
      role: 'user',
      content: question,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempUserMsg]);
    setIsGenerating(true);
    setError(null);

    const { data, error } = await apiClient.post(`/sessions/${sessionId}/messages`, {
      question,
      connection_id: connectionId,
    });

    setIsGenerating(false);

    if (error) {
      setError(error);
      return { data: null, error };
    }

    // Re-fetch messages to get the persisted versions
    const { data: msgs } = await apiClient.get(`/sessions/${sessionId}/messages`);
    if (msgs) setMessages(msgs);

    return { data, error: null };
  }, []);

  const cancelGeneration = useCallback(async () => {
    return apiClient.post('/chat/cancel');
  }, []);

  const searchSessions = useCallback(async (query) => {
    if (!query?.trim()) return { data: [], error: null };
    return apiClient.get(`/sessions/search?q=${encodeURIComponent(query)}`);
  }, []);

  return {
    sessions,
    activeSession,
    messages,
    isGenerating,
    error,
    fetchSessions,
    createSession,
    selectSession,
    deleteSession,
    sendMessage,
    cancelGeneration,
    searchSessions,
  };
}
