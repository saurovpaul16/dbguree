import React, { useState } from 'react';
import { useChatContext } from '../context/ChatContext';

export function HistoryPanel() {
  const { sessions, selectSession, deleteSession, searchSessions } = useChatContext();
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState(null);

  const handleSearch = async (q) => {
    setQuery(q);
    if (!q.trim()) { setSearchResults(null); return; }
    const { data } = await searchSessions(q);
    setSearchResults(data || []);
  };

  const displayed = searchResults !== null ? searchResults : sessions;

  return (
    <div className="panel">
      <div className="panel-header">
        <span className="panel-title">Chat History</span>
      </div>
      <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <input
          className="input-field"
          placeholder="Search sessions… (FTS5)"
          value={query}
          onChange={(e) => handleSearch(e.target.value)}
          style={{ fontSize: 11 }}
        />
      </div>
      <div className="panel-body" style={{ overflowY: 'auto' }}>
        {displayed.length === 0 && (
          <div style={{ padding: '12px 10px', fontSize: 11, color: 'var(--text-2)' }}>
            {query ? 'No sessions match your search.' : 'No chat history yet.'}
          </div>
        )}
        {displayed.map((session) => (
          <div
            key={session.id}
            onClick={() => selectSession(session)}
            style={{
              padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid var(--border)',
              transition: 'background 0.1s', borderLeft: '2px solid transparent',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-3)'; e.currentTarget.style.borderLeftColor = 'var(--accent)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderLeftColor = 'transparent'; }}
          >
            <div style={{ fontSize: 12, color: 'var(--text-0)', marginBottom: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {session.title}
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-2)', fontFamily: 'var(--mono)' }}>
              {new Date(session.last_active_at).toLocaleDateString()} • {session.connection_profile_id?.slice(0, 8)}…
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
