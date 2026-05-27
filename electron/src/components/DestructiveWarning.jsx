import React from 'react';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';

/**
 * Destructive query confirmation modal. [FR-SAFE-02, TR-7]
 * Shown when AST detection finds INSERT/UPDATE/DELETE/DROP/TRUNCATE/ALTER.
 */
export function DestructiveWarning({ isOpen, operations, sql, onConfirm, onCancel }) {
  const preview = sql && sql.length > 200 ? sql.slice(0, 200) + '…' : sql;

  return (
    <Modal isOpen={isOpen} onClose={onCancel} title="⚠ Destructive Query Detected" width={480}>
      <div style={{ marginBottom: 14 }}>
        <div style={{ marginBottom: 10 }}>
          <span style={{ fontSize: 11, color: 'var(--text-2)' }}>Detected operations: </span>
          {operations?.map((op) => (
            <span key={op} style={{
              display: 'inline-block', marginLeft: 4, padding: '1px 6px', borderRadius: 3,
              background: 'rgba(248,113,113,0.12)', color: 'var(--red)', fontSize: 11, fontFamily: 'var(--mono)',
            }}>
              {op}
            </span>
          ))}
        </div>
        {preview && (
          <pre style={{
            padding: '8px 10px', borderRadius: 4, background: 'var(--bg-0)',
            border: '1px solid var(--border)', fontFamily: 'var(--mono)',
            fontSize: 11, color: 'var(--text-1)', overflowX: 'auto', whiteSpace: 'pre-wrap',
            wordBreak: 'break-all',
          }}>
            {preview}
          </pre>
        )}
        <p style={{ marginTop: 10, fontSize: 12, color: 'var(--text-2)' }}>
          This action may be irreversible.
        </p>
      </div>
      <div className="modal-footer">
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button variant="danger" onClick={onConfirm}>Run Anyway</Button>
      </div>
    </Modal>
  );
}
