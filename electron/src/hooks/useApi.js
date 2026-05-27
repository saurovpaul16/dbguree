/**
 * Base API client.
 *
 * In Electron: routes through the contextBridge (window.api) so that all
 * HTTP traffic stays in the main process — the renderer never opens raw sockets.
 *
 * In a plain browser (dev mode without Electron): falls back to direct fetch()
 * calls against the backend port stored in window.__DBGUREE_PORT (set by the
 * dev-server or by a <script> tag in index.html for local development).
 *
 * Returns { data, error, status } for every call.
 */

const _directFetch = async (method, path, body) => {
  const port = window.__DBGUREE_PORT || 64430;
  const url = `http://127.0.0.1:${port}${path}`;
  try {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    let data;
    try { data = await res.json(); } catch (_) { data = null; }
    return { data, status: res.status };
  } catch (err) {
    return { data: null, error: err.message, status: 500 };
  }
};

const _request = async (method, path, body) => {
  try {
    console.log(`[apiClient] ${method} ${path}`, body ? 'with body' : 'no body');

    // Electron context: use the IPC bridge (window.api injected by preload.js)
    // Browser / dev-server context: use direct fetch()
    const result = window.api
      ? await window.api.request(method, path, body)
      : await _directFetch(method, path, body);

    console.log(`[apiClient] Response:`, result);
    if (result.error && !result.data) {
      return { data: null, error: result.error, status: result.status ?? 500 };
    }
    const status = result.status ?? 200;
    if (status >= 400) {
      const msg =
        result.data?.detail?.message ||
        result.data?.detail ||
        result.data?.error ||
        `HTTP ${status}`;
      return { data: null, error: msg, status };
    }
    return { data: result.data, error: null, status };
  } catch (err) {
    console.error(`[apiClient] Exception:`, err);
    return { data: null, error: err.message, status: 500 };
  }
};

export const apiClient = {
  get:    (path)        => _request('GET',    path),
  post:   (path, body)  => _request('POST',   path, body),
  put:    (path, body)  => _request('PUT',    path, body),
  delete: (path)        => _request('DELETE', path),
};
