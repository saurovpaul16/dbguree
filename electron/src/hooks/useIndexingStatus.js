import { useEffect, useRef, useState } from 'react';
import { apiClient } from './useApi';

/**
 * Polls /connections/{id}/indexing-status every 2 seconds.
 * Stops automatically when status is 'complete' or 'error'. [TR-4]
 */
export function useIndexingStatus(connectionId) {
  const [status, setStatus] = useState({ status: 'idle', progress_pct: 0, message: '' });
  const timerRef = useRef(null);

  useEffect(() => {
    if (!connectionId) {
      setStatus({ status: 'idle', progress_pct: 0, message: '' });
      return;
    }

    const poll = async () => {
      const { data, error } = await apiClient.get(
        `/connections/${connectionId}/indexing-status`
      );
      if (!error && data) {
        setStatus(data);
        if (data.status === 'complete' || data.status === 'error') {
          clearInterval(timerRef.current);
        }
      }
    };

    poll();
    timerRef.current = setInterval(poll, 2000);

    return () => clearInterval(timerRef.current);
  }, [connectionId]);

  return status;
}
