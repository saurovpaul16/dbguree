import { useCallback, useEffect, useRef, useState } from 'react';
import { apiClient } from './useApi';

/**
 * All connection CRUD + status polling.
 * Components never call apiClient directly — they use this hook.
 */
export function useConnections() {
  const [connections, setConnections] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const pollTimers = useRef({});

  const fetchConnections = useCallback(async () => {
    setLoading(true);
    const { data, error } = await apiClient.get('/connections');
    setLoading(false);
    if (error) { setError(error); return; }
    setConnections(data || []);
  }, []);

  useEffect(() => {
    fetchConnections();
    return () => {
      Object.values(pollTimers.current).forEach(clearInterval);
    };
  }, [fetchConnections]);

  const createConnection = useCallback(async (payload) => {
    const { data, error } = await apiClient.post('/connections', payload);
    if (!error) await fetchConnections();
    return { data, error };
  }, [fetchConnections]);

  const updateConnection = useCallback(async (id, payload) => {
    const { data, error } = await apiClient.put(`/connections/${id}`, payload);
    if (!error) await fetchConnections();
    return { data, error };
  }, [fetchConnections]);

  const deleteConnection = useCallback(async (id) => {
    const { error } = await apiClient.delete(`/connections/${id}`);
    if (!error) {
      clearInterval(pollTimers.current[id]);
      delete pollTimers.current[id];
      await fetchConnections();
    }
    return { error };
  }, [fetchConnections]);

  const testConnection = useCallback(async (id) => {
    return apiClient.post(`/connections/${id}/test`);
  }, []);

  const connectToDb = useCallback(async (id) => {
    const { data, error } = await apiClient.post(`/connections/${id}/connect`);
    if (!error) await fetchConnections();
    return { data, error };
  }, [fetchConnections]);

  const refreshSchema = useCallback(async (id) => {
    return apiClient.post(`/connections/${id}/schema/refresh`);
  }, []);

  const getConnectionStatus = useCallback(async (id) => {
    return apiClient.get(`/connections/${id}/status`);
  }, []);

  const getIndexingStatus = useCallback(async (id) => {
    return apiClient.get(`/connections/${id}/indexing-status`);
  }, []);

  return {
    connections,
    loading,
    error,
    createConnection,
    updateConnection,
    deleteConnection,
    testConnection,
    connectToDb,
    refreshSchema,
    getConnectionStatus,
    getIndexingStatus,
    refetch: fetchConnections,
  };
}
