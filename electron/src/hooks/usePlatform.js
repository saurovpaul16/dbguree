import { useMemo } from 'react';

/**
 * Platform-adaptive keyboard shortcuts. [TR-9]
 * Reads process.platform via window.api.platform (exposed by preload).
 */
export function usePlatform() {
  return useMemo(() => {
    const isMac = window.api?.platform === 'darwin';
    return {
      isMac,
      submitShortcut: isMac ? '⌘+Enter' : 'Ctrl+Enter',
      runShortcut:    isMac ? '⌘+R'     : 'Ctrl+R',
      newTabShortcut: isMac ? '⌘+T'     : 'Ctrl+T',
    };
  }, []);
}
