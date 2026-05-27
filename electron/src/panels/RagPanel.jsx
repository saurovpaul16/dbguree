import React, { useRef } from 'react';
import { useRag } from '../hooks/useRag';
import { useApp } from '../context/AppContext';
import { Spinner } from '../components/ui/Spinner';

export function RagPanel({ connectionId }) {
  const { documents, pairs, flaggedPairs, loading, uploadDocument, deleteDocument, deletePair } = useRag(connectionId);
  const { notify } = useApp();
  const fileInputRef = useRef(null);

  const handleFileChange = async (e) => {
    const files = Array.from(e.target.files || []);
    for (const file of files) {
      const { error } = await uploadDocument(file);
      if (error) notify('error', `Failed to upload ${file.name}: ${error}`);
      else notify('success', `${file.name} indexed`);
    }
    e.target.value = '';
  };

  if (!connectionId) {
    return (
      <div className="panel">
        <div className="panel-header"><span className="panel-title">Knowledge Graph</span></div>
        <div style={{ padding: 16, color: 'var(--text-2)', fontSize: 12 }}>Select a connection first.</div>
      </div>
    );
  }

  return (
    <div className="panel">
      <div className="panel-header">
        <span className="panel-title">Knowledge Graph</span>
        {loading && <Spinner size={12} />}
        <button
          onClick={() => fileInputRef.current?.click()}
          style={{ padding: '3px 8px', borderRadius: 4, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-2)', fontSize: 11, cursor: 'pointer', fontFamily: 'var(--sans)' }}
        >
          + Upload
        </button>
        <input ref={fileInputRef} type="file" multiple accept=".pdf,.docx,.txt,.md" onChange={handleFileChange} style={{ display: 'none' }} />
      </div>

      <div className="panel-body" style={{ overflowY: 'auto' }}>
        {/* Documents */}
        <div style={{ padding: '8px 12px 4px', fontSize: 10, color: 'var(--text-2)', fontWeight: 600, letterSpacing: '0.6px', textTransform: 'uppercase' }}>
          Documents ({documents.length})
        </div>
        {documents.length === 0 && (
          <div style={{ padding: '4px 12px 10px', fontSize: 11, color: 'var(--text-2)' }}>Upload PDF, DOCX, TXT, or Markdown.</div>
        )}
        {documents.map((doc) => (
          <div key={doc.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', borderBottom: '1px solid var(--border)' }}>
            <span style={{ fontSize: 14 }}>{doc.file_type === 'pdf' ? '📕' : doc.file_type === 'docx' ? '📄' : '📝'}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11, color: 'var(--text-0)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.filename}</div>
              <div style={{ fontSize: 10, color: doc.indexing_status === 'indexed' ? 'var(--green)' : doc.indexing_status === 'error' ? 'var(--red)' : 'var(--text-2)' }}>
                {doc.indexing_status}
              </div>
            </div>
            <button onClick={() => deleteDocument(doc.id)} style={{ background: 'none', border: 'none', color: 'var(--text-2)', cursor: 'pointer', fontSize: 12 }} title="Remove">✕</button>
          </div>
        ))}

        {/* Flagged pairs warning */}
        {flaggedPairs.length > 0 && (
          <div style={{ margin: '8px 12px', padding: '7px 10px', borderRadius: 4, background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.3)', fontSize: 11, color: 'var(--yellow)' }}>
            ⚠ {flaggedPairs.length} learned {flaggedPairs.length === 1 ? 'pair' : 'pairs'} may be stale — schema changed.
          </div>
        )}

        {/* Learned pairs */}
        <div style={{ padding: '8px 12px 4px', fontSize: 10, color: 'var(--text-2)', fontWeight: 600, letterSpacing: '0.6px', textTransform: 'uppercase', marginTop: 4 }}>
          Learned Pairs ({pairs.length})
        </div>
        {pairs.length === 0 && (
          <div style={{ padding: '4px 12px', fontSize: 11, color: 'var(--text-2)' }}>No pairs yet. Approve executed queries to add them.</div>
        )}
        {pairs.map((pair) => (
          <div key={pair.id} style={{ padding: '7px 12px', borderBottom: '1px solid var(--border)', opacity: pair.is_flagged ? 0.6 : 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <span style={{ fontSize: 11, color: 'var(--text-1)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pair.nl_question || '(no question)'}</span>
              {pair.is_flagged && <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, background: 'rgba(251,191,36,0.15)', color: 'var(--yellow)' }}>Stale</span>}
              <button onClick={() => deletePair(pair.id)} style={{ background: 'none', border: 'none', color: 'var(--text-2)', cursor: 'pointer', fontSize: 11 }}>✕</button>
            </div>
            <pre style={{ fontSize: 10, color: 'var(--text-2)', fontFamily: 'var(--mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: 0 }}>
              {pair.sql?.slice(0, 100)}
            </pre>
          </div>
        ))}
      </div>
    </div>
  );
}
