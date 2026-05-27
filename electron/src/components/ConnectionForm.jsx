import React, { useEffect, useState } from 'react';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';

const DEFAULT_PORTS = { postgresql: 5432, mysql: 3306, mssql: 1433 };

const INITIAL = {
  name: '', db_type: 'postgresql', host: 'localhost', port: 5432,
  database: '', username: '', password: '', read_only: false,
  row_limit: 1000, query_timeout_seconds: 30, persona_mode: 'analyst',
};

export function ConnectionForm({ isOpen, onClose, onSave, onTest, initial = null }) {
  const [form, setForm] = useState(INITIAL);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setForm(initial ? { ...INITIAL, ...initial, password: '' } : INITIAL);
      setTestResult(null);
    }
  }, [isOpen, initial]);

  const set = (field, value) => {
    setForm((prev) => {
      const next = { ...prev, [field]: value };
      if (field === 'db_type') next.port = DEFAULT_PORTS[value] || prev.port;
      return next;
    });
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    const result = await onTest(form);
    setTesting(false);
    setTestResult(result);
  };

  const [saveError, setSaveError] = useState(null);

  const handleSave = async () => {
    setSaveError(null);

    // Client-side validation
    if (!form.name.trim()) { setSaveError('Display Name is required.'); return; }
    if (!form.database.trim()) { setSaveError('Database name is required.'); return; }
    if (!form.username.trim()) { setSaveError('Username is required.'); return; }

    setSaving(true);
    const result = await onSave(form);
    setSaving(false);

    if (result?.error) {
      setSaveError(result.error);
    } else {
      onClose();
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={initial ? 'Edit Connection' : 'New Connection'} width={480}>
      {/* DB type selector */}
      <div className="form-group">
        <label className="form-label">Database Type</label>
        <div style={{ display: 'flex', gap: 8 }}>
          {['postgresql', 'mysql', 'mssql'].map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => set('db_type', t)}
              style={{
                flex: 1, padding: '6px 0', borderRadius: 4, border: '1px solid',
                borderColor: form.db_type === t ? 'var(--accent)' : 'var(--border)',
                background: form.db_type === t ? 'var(--accent-glow)' : 'transparent',
                color: form.db_type === t ? 'var(--accent)' : 'var(--text-2)',
                cursor: 'pointer', fontSize: 11, fontFamily: 'var(--sans)',
                transition: 'all 0.15s',
              }}
            >
              {t === 'postgresql' ? 'PostgreSQL' : t === 'mysql' ? 'MySQL' : 'SQL Server'}
            </button>
          ))}
        </div>
      </div>

      <div className="form-group">
        <label className="form-label">Display Name</label>
        <input className="input-field" value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Production DB" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px', gap: 8 }}>
        <div className="form-group">
          <label className="form-label">Host</label>
          <input className="input-field" value={form.host} onChange={(e) => set('host', e.target.value)} placeholder="localhost" />
        </div>
        <div className="form-group">
          <label className="form-label">Port</label>
          <input className="input-field" type="number" value={form.port} onChange={(e) => set('port', parseInt(e.target.value) || 0)} />
        </div>
      </div>

      <div className="form-group">
        <label className="form-label">Database</label>
        <input className="input-field" value={form.database} onChange={(e) => set('database', e.target.value)} placeholder="mydb" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <div className="form-group">
          <label className="form-label">Username</label>
          <input className="input-field" value={form.username} onChange={(e) => set('username', e.target.value)} placeholder="postgres" />
        </div>
        <div className="form-group">
          <label className="form-label">Password</label>
          <input className="input-field" type="password" value={form.password} onChange={(e) => set('password', e.target.value)} placeholder={initial ? '(unchanged)' : ''} />
        </div>
      </div>

      {/* Advanced options */}
      <details style={{ marginBottom: 12 }}>
        <summary style={{ fontSize: 11, color: 'var(--text-2)', cursor: 'pointer', userSelect: 'none' }}>Advanced options</summary>
        <div style={{ marginTop: 10 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div className="form-group">
              <label className="form-label">Row Limit</label>
              <input className="input-field" type="number" value={form.row_limit} onChange={(e) => set('row_limit', parseInt(e.target.value) || 1000)} />
            </div>
            <div className="form-group">
              <label className="form-label">Timeout (s)</label>
              <input className="input-field" type="number" value={form.query_timeout_seconds} onChange={(e) => set('query_timeout_seconds', parseInt(e.target.value) || 30)} />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Persona</label>
            <select className="input-field" value={form.persona_mode} onChange={(e) => set('persona_mode', e.target.value)}>
              <option value="analyst">DataAnalyst</option>
              <option value="developer">Developer</option>
              <option value="dba">DBA</option>
            </select>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
            <input id="read-only-toggle" type="checkbox" checked={form.read_only} onChange={(e) => set('read_only', e.target.checked)} />
            <label htmlFor="read-only-toggle" style={{ fontSize: 12, color: 'var(--text-1)', cursor: 'pointer' }}>
              Read-only mode
            </label>
          </div>
        </div>
      </details>

      {testResult && (
        <div style={{
          padding: '7px 10px', borderRadius: 4, marginBottom: 12, fontSize: 11,
          background: testResult.success ? 'rgba(61,214,140,0.08)' : 'rgba(248,113,113,0.08)',
          border: `1px solid ${testResult.success ? 'rgba(61,214,140,0.3)' : 'rgba(248,113,113,0.3)'}`,
          color: testResult.success ? 'var(--green)' : 'var(--red)',
        }}>
          {testResult.success
            ? `✓ Connected — ${testResult.data?.db_version} (${testResult.data?.latency_ms}ms)`
            : `✕ ${testResult.error || testResult.data?.error || 'Connection failed'}`}
        </div>
      )}

      {saveError && (
        <div style={{
          padding: '7px 10px', borderRadius: 4, marginBottom: 12, fontSize: 11,
          background: 'rgba(248,113,113,0.08)',
          border: '1px solid rgba(248,113,113,0.3)',
          color: 'var(--red)',
        }}>
          ✕ {saveError}
        </div>
      )}

      <div className="modal-footer">
        <Button variant="ghost" onClick={handleTest} disabled={testing}>
          {testing ? 'Testing...' : 'Test Connection'}
        </Button>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving...' : 'Save'}
        </Button>
      </div>
    </Modal>
  );
}
