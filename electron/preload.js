'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // Generic request
  request: (method, path, body) =>
    ipcRenderer.invoke('api-request', { method, path, body }),

  // Convenience shorthands
  get: (path) => ipcRenderer.invoke('api-request', { method: 'GET', path }),
  post: (path, body) => ipcRenderer.invoke('api-request', { method: 'POST', path, body }),
  put: (path, body) => ipcRenderer.invoke('api-request', { method: 'PUT', path, body }),
  del: (path) => ipcRenderer.invoke('api-request', { method: 'DELETE', path }),

  // Backend ready event (fired from main process after health check passes)
  onBackendReady: (callback) => ipcRenderer.on('backend-ready', (_event, data) => callback(data)),

  // Platform info for adaptive keyboard shortcuts [TR-9]
  platform: process.platform,
});
