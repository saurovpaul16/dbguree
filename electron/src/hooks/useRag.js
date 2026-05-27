import { useCallback, useEffect, useState } from 'react';
import { apiClient } from './useApi';

export function useRag(connectionId) {
  const [documents, setDocuments] = useState([]);
  const [pairs, setPairs] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchAll = useCallback(async () => {
    if (!connectionId) return;
    setLoading(true);
    const [docsRes, pairsRes] = await Promise.all([
      apiClient.get(`/rag/${connectionId}/documents`),
      apiClient.get(`/rag/${connectionId}/pairs`),
    ]);
    if (!docsRes.error) setDocuments(docsRes.data || []);
    if (!pairsRes.error) setPairs(pairsRes.data || []);
    setLoading(false);
  }, [connectionId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const uploadDocument = useCallback(async (file) => {
    const formData = new FormData();
    formData.append('file', file);
    // FormData upload via raw fetch (window.api doesn't handle multipart)
    try {
      const port = window._backendPort;
      const res = await fetch(`http://127.0.0.1:${port}/rag/${connectionId}/documents`, {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      await fetchAll();
      return { data, error: null };
    } catch (err) {
      return { data: null, error: err.message };
    }
  }, [connectionId, fetchAll]);

  const deleteDocument = useCallback(async (id) => {
    const { error } = await apiClient.delete(`/rag/${connectionId}/documents/${id}`);
    if (!error) await fetchAll();
    return { error };
  }, [connectionId, fetchAll]);

  const createPair = useCallback(async (payload) => {
    const { data, error } = await apiClient.post(`/rag/${connectionId}/pairs`, payload);
    if (!error) await fetchAll();
    return { data, error };
  }, [connectionId, fetchAll]);

  const deletePair = useCallback(async (id) => {
    const { error } = await apiClient.delete(`/rag/${connectionId}/pairs/${id}`);
    if (!error) await fetchAll();
    return { error };
  }, [connectionId, fetchAll]);

  const flaggedPairs = pairs.filter((p) => p.is_flagged);

  return {
    documents,
    pairs,
    flaggedPairs,
    loading,
    uploadDocument,
    deleteDocument,
    createPair,
    deletePair,
    refetch: fetchAll,
  };
}
