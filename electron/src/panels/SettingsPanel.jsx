import React, { useEffect, useRef, useState } from 'react';
import { useSystemInfo } from '../hooks/useSystemInfo';
import { ProgressBar } from '../components/ui/ProgressBar';
import { useApp } from '../context/AppContext';
import { apiClient } from '../hooks/useApi';

export function SettingsPanel() {
  const { ram, models, llmStatus, triggerDownload, refetch } = useSystemInfo();
  const { notify } = useApp();
  const [downloadStatuses, setDownloadStatuses] = useState({});
  const [activatingKey, setActivatingKey] = useState(null);
  const [cloudApiKey, setCloudApiKey] = useState('');
  const [cloudProvider, setCloudProvider] = useState('openai');
  const pollTimers = useRef({});

  const handleDownload = async (modelKey) => {
    const { error } = await triggerDownload(modelKey);
    if (error) { notify('error', `Download failed: ${error}`); return; }
    notify('info', `Downloading ${modelKey}…`);

    pollTimers.current[modelKey] = setInterval(async () => {
      const { data } = await apiClient.get(`/system/models/download/${modelKey}/status`);
      if (data) {
        setDownloadStatuses((prev) => ({ ...prev, [modelKey]: data }));
        if (data.status === 'complete' || data.status === 'error') {
          clearInterval(pollTimers.current[modelKey]);
          if (data.status === 'complete') { notify('success', `${modelKey} downloaded — click Activate to use it`); refetch(); }
          if (data.status === 'error') notify('error', `Download failed: ${data.error}`);
        }
      }
    }, 1000);
  };

  const handleActivate = async (modelKey) => {
    setActivatingKey(modelKey);
    const { data, error } = await apiClient.post(`/llm/load?model_key=${encodeURIComponent(modelKey)}`);
    setActivatingKey(null);
    if (error || data?.detail) {
      notify('error', `Could not activate ${modelKey}: ${error || data?.detail}`);
    } else {
      notify('success', `Model activated: ${modelKey}`);
      refetch();
    }
  };

  const handleRemove = async (modelKey) => {
    const { data, error } = await apiClient.delete(`/system/models/${encodeURIComponent(modelKey)}`);
    if (error || data?.detail) {
      notify('error', `Could not remove ${modelKey}: ${error || data?.detail}`);
    } else {
      notify('success', `${modelKey} removed`);
      refetch();
    }
  };

  useEffect(() => () => Object.values(pollTimers.current).forEach(clearInterval), []);

  const handleSaveApiKey = async () => {
    if (cloudApiKey && cloudProvider) {
      const { error } = await apiClient.post(`/llm/cloud/configure?provider=${cloudProvider}&api_key=${encodeURIComponent(cloudApiKey)}`);
      if (error) notify('error', error);
      else { notify('success', 'API key saved'); setCloudApiKey(''); }
    }
  };

  // active_model_key is always set (even when file missing); model is null when file missing
  const activeModelKey = llmStatus?.active_model_key;
  const modelAvailable = llmStatus?.model_available;

  return (
    <div className="panel">
      <div className="panel-header"><span className="panel-title">Settings</span></div>
      <div className="panel-body" style={{ overflowY: 'auto', padding: 16, gap: 20, display: 'flex', flexDirection: 'column' }}>

        {/* System info */}
        <section>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-1)', marginBottom: 10, letterSpacing: 0.3 }}>System</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div style={{ padding: '8px 10px', borderRadius: 4, background: 'var(--bg-2)', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 10, color: 'var(--text-2)', marginBottom: 3 }}>RAM</div>
              <div style={{ fontSize: 14, fontFamily: 'var(--mono)', color: 'var(--text-0)' }}>{ram?.ram_gb || '—'} GB</div>
            </div>
            <div style={{ padding: '8px 10px', borderRadius: 4, background: 'var(--bg-2)', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 10, color: 'var(--text-2)', marginBottom: 3 }}>Active Model</div>
              <div style={{ fontSize: 12, fontFamily: 'var(--mono)', color: modelAvailable ? 'var(--green)' : 'var(--text-2)' }}>
                {modelAvailable ? activeModelKey : (activeModelKey ? 'Not downloaded' : 'None')}
              </div>
            </div>
          </div>
        </section>

        {/* Local models */}
        <section>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-1)', marginBottom: 4, letterSpacing: 0.3 }}>Local Models</div>
          <div style={{ fontSize: 10, color: 'var(--text-2)', marginBottom: 10 }}>
            Download a model, then click Activate to start using it.
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {models.map((model) => {
              const dlStatus = downloadStatuses[model.key];
              const isDownloading = dlStatus?.status === 'downloading';
              // Direct key comparison — activeModelKey comes from active_model_key on the backend
              const isActive = activeModelKey === model.key && modelAvailable;
              const isConfigured = activeModelKey === model.key; // selected but maybe file missing
              const isActivating = activatingKey === model.key;
              const sizeMB = (model.total_bytes / 1024 / 1024).toFixed(0);
              return (
                <div
                  key={model.key}
                  style={{
                    padding: '10px 12px', borderRadius: 4, background: 'var(--bg-2)',
                    border: `1px solid ${isActive ? 'var(--accent)' : 'var(--border)'}`,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: isDownloading ? 8 : 0 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12, color: 'var(--text-0)', fontFamily: 'var(--mono)' }}>{model.key}</div>
                      <div style={{ fontSize: 10, color: 'var(--text-2)', marginTop: 2 }}>{model.description} • {sizeMB} MB</div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {isActive ? (
                        // Active + file exists — show label and offer Remove
                        <>
                          <span style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 600 }}>Active</span>
                          <button
                            onClick={() => handleRemove(model.key)}
                            title="Remove model file from disk"
                            style={{
                              padding: '2px 7px', borderRadius: 4,
                              border: '1px solid var(--red, #e05c5c)', background: 'transparent',
                              color: 'var(--red, #e05c5c)', fontSize: 10, cursor: 'pointer',
                              fontFamily: 'var(--sans)',
                            }}
                          >
                            Remove
                          </button>
                        </>
                      ) : model.downloaded ? (
                        // Downloaded, not active — Activate + Remove
                        <>
                          <button
                            onClick={() => handleActivate(model.key)}
                            disabled={isActivating}
                            style={{
                              padding: '3px 10px', borderRadius: 4,
                              border: '1px solid var(--accent)', background: 'var(--accent-glow)',
                              color: 'var(--accent)', fontSize: 11, cursor: isActivating ? 'default' : 'pointer',
                              fontFamily: 'var(--sans)', opacity: isActivating ? 0.6 : 1,
                            }}
                          >
                            {isActivating ? 'Loading…' : 'Activate'}
                          </button>
                          <button
                            onClick={() => handleRemove(model.key)}
                            title="Remove model file from disk"
                            style={{
                              padding: '2px 7px', borderRadius: 4,
                              border: '1px solid var(--border)', background: 'transparent',
                              color: 'var(--text-2)', fontSize: 10, cursor: 'pointer',
                              fontFamily: 'var(--sans)',
                            }}
                          >
                            Remove
                          </button>
                        </>
                      ) : !isDownloading ? (
                        // Not downloaded — Download button
                        <button
                          onClick={() => handleDownload(model.key)}
                          style={{
                            padding: '3px 10px', borderRadius: 4,
                            border: '1px solid var(--border)', background: 'var(--bg-3)',
                            color: 'var(--text-1)', fontSize: 11, cursor: 'pointer',
                            fontFamily: 'var(--sans)',
                          }}
                        >
                          Download
                        </button>
                      ) : null}
                    </div>
                  </div>

                  {isDownloading && (
                    <ProgressBar value={dlStatus.progress_pct} label="Downloading…" showPercent />
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* Cloud LLM */}
        <section>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-1)', marginBottom: 10, letterSpacing: 0.3 }}>Cloud LLM (Optional)</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div className="form-group">
              <label className="form-label">Provider</label>
              <select className="input-field" value={cloudProvider} onChange={(e) => setCloudProvider(e.target.value)}>
                <option value="openai">OpenAI</option>
                <option value="anthropic">Anthropic</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">API Key</label>
              <input className="input-field" type="password" value={cloudApiKey} onChange={(e) => setCloudApiKey(e.target.value)} placeholder="sk-…" />
            </div>
            <button
              onClick={handleSaveApiKey}
              disabled={!cloudApiKey}
              style={{
                padding: '6px 14px', borderRadius: 4, border: '1px solid var(--border)',
                background: 'var(--bg-3)', color: 'var(--text-1)', fontSize: 12,
                cursor: 'pointer', fontFamily: 'var(--sans)', opacity: cloudApiKey ? 1 : 0.5,
              }}
            >
              Save API Key
            </button>
          </div>
        </section>

      </div>
    </div>
  );
}
