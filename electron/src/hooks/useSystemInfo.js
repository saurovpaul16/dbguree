import { useCallback, useEffect, useRef, useState } from 'react';
import { apiClient } from './useApi';

export function useSystemInfo() {
  const [ram, setRam] = useState(null);
  const [models, setModels] = useState([]);
  const [llmStatus, setLlmStatus] = useState(null);
  const pollRef = useRef(null);

  const fetchAll = useCallback(async () => {
    const [ramRes, modelsRes, llmRes] = await Promise.all([
      apiClient.get('/system/ram'),
      apiClient.get('/system/models'),
      apiClient.get('/llm/status'),
    ]);
    if (!ramRes.error) setRam(ramRes.data);
    if (!modelsRes.error) setModels(modelsRes.data || []);
    if (!llmRes.error) setLlmStatus(llmRes.data);
  }, []);

  // Poll llm/status every 5 s so the status bar stays in sync across all
  // component instances (e.g. after activating a model in SettingsPanel).
  const fetchLlmStatus = useCallback(async () => {
    const res = await apiClient.get('/llm/status');
    if (!res.error) setLlmStatus(res.data);
  }, []);

  useEffect(() => {
    fetchAll();
    pollRef.current = setInterval(fetchLlmStatus, 5000);
    return () => clearInterval(pollRef.current);
  }, [fetchAll, fetchLlmStatus]);

  const triggerDownload = useCallback(async (modelKey) => {
    return apiClient.post(`/system/models/download/${modelKey}`);
  }, []);

  const getDownloadStatus = useCallback(async (modelKey) => {
    return apiClient.get(`/system/models/download/${modelKey}/status`);
  }, []);

  return { ram, models, llmStatus, triggerDownload, getDownloadStatus, refetch: fetchAll };
}
