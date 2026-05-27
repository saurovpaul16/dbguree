import { useCallback, useEffect, useState } from 'react';
import { apiClient } from './useApi';

export function useSchema(connectionId) {
  const [schema, setSchema] = useState(null);
  const [loading, setLoading] = useState(false);

  const fetchSchema = useCallback(async () => {
    if (!connectionId) { setSchema(null); return; }
    setLoading(true);
    const { data, error } = await apiClient.get(`/connections/${connectionId}/schema`);
    setLoading(false);
    if (!error) setSchema(data);
  }, [connectionId]);

  useEffect(() => { fetchSchema(); }, [fetchSchema]);

  return { schema, loading, refetch: fetchSchema };
}
