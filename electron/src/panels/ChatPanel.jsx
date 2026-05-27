import React, { useEffect, useRef, useState } from 'react';
import { useChatContext } from '../context/ChatContext';
import { useApp } from '../context/AppContext';
import { SqlBlock } from '../components/SqlBlock';
import { Spinner } from '../components/ui/Spinner';
import { usePlatform } from '../hooks/usePlatform';

function ChatMessage({ message, onPushToEdit, onMoveToQuery }) {
  const isUser = message.role === 'user';
  const time = message.created_at
    ? new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : '';

  return (
    <div style={{
      padding: '8px 14px',
      display: 'flex',
      flexDirection: 'column',
      alignItems: isUser ? 'flex-end' : 'flex-start',
    }}>
      <div style={{
        maxWidth: '85%',
        background: isUser ? 'var(--bg-3)' : 'var(--bg-2)',
        border: '1px solid var(--border)',
        borderRadius: isUser ? '8px 8px 2px 8px' : '8px 8px 8px 2px',
        padding: '8px 12px',
      }}>
        {message.content && (
          <p style={{ fontSize: 12, color: 'var(--text-1)', lineHeight: 1.6, margin: 0 }}>
            {message.content}
          </p>
        )}
        {message.sql_generated && (
          <SqlBlock
            sql={message.sql_generated}
            explanation={null}
            timestamp={time}
            onPushToEdit={onPushToEdit}
            onMoveToQuery={onMoveToQuery}
          />
        )}
      </div>
      <span style={{ fontSize: 10, color: 'var(--text-2)', marginTop: 3 }}>{time}</span>
    </div>
  );
}

export function ChatPanel({ connectionId, onPushToEdit, onMoveToQuery }) {
  const { messages, isGenerating, sendMessage, cancelGeneration, createSession, activeSession } = useChatContext();
  const { notify } = useApp();
  const { submitShortcut, isMac } = usePlatform();
  const [input, setInput] = useState('');
  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isGenerating]);

  const handleSubmit = async () => {
    if (!input.trim() || isGenerating) return;
    if (!connectionId) {
      notify('error', 'Select a connection first.');
      return;
    }

    let session = activeSession;
    if (!session) {
      const { data, error } = await createSession(connectionId, input.slice(0, 60));
      if (error) { notify('error', error); return; }
      session = data;
    }

    const q = input.trim();
    setInput('');

    const { error } = await sendMessage(session.id, q, connectionId);
    if (error && error !== 'Generation cancelled') {
      notify('error', error);
    }
  };

  const handleKeyDown = (e) => {
    const mod = isMac ? e.metaKey : e.ctrlKey;
    if (mod && e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="panel" style={{ borderRight: '1px solid var(--border)' }}>
      {/* Header */}
      <div className="panel-header">
        <span className="panel-title">AI Assistant</span>
        {connectionId && (
          <span className="badge badge-accent" style={{ fontSize: 10 }}>
            {connectionId.slice(0, 8)}…
          </span>
        )}
      </div>

      {/* Messages */}
      <div className="panel-body" style={{ overflowY: 'auto' }}>
        {messages.length === 0 && !isGenerating && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', flexDirection: 'column', gap: 8, color: 'var(--text-2)' }}>
            <span style={{ fontSize: 28 }}>✦</span>
            <span style={{ fontSize: 13 }}>Ask anything about your data</span>
            <span style={{ fontSize: 11 }}>{submitShortcut} to send</span>
          </div>
        )}

        {messages.map((msg) => (
          <ChatMessage
            key={msg.id}
            message={msg}
            onPushToEdit={onPushToEdit}
            onMoveToQuery={onMoveToQuery}
          />
        ))}

        {isGenerating && (
          <div style={{ padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Spinner size={12} />
            <span style={{ fontSize: 11, color: 'var(--text-2)' }}>Generating SQL…</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div style={{ borderTop: '1px solid var(--border)', padding: 10, flexShrink: 0 }}>
        {isGenerating && (
          <div style={{ marginBottom: 6, display: 'flex', justifyContent: 'flex-end' }}>
            <button
              onClick={cancelGeneration}
              style={{
                padding: '3px 10px', borderRadius: 4,
                border: '1px solid rgba(248,113,113,0.4)',
                background: 'rgba(248,113,113,0.08)',
                color: 'var(--red)', fontSize: 11, cursor: 'pointer',
                fontFamily: 'var(--sans)', transition: 'all 0.15s',
              }}
            >
              ■ Stop generating
            </button>
          </div>
        )}
        <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end' }}>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={`Ask AI… ${submitShortcut}`}
            disabled={isGenerating}
            rows={2}
            style={{
              flex: 1, resize: 'none', padding: '7px 10px',
              borderRadius: 4, border: '1px solid var(--border)',
              background: 'var(--bg-3)', color: 'var(--text-0)',
              fontFamily: 'var(--sans)', fontSize: 12,
              outline: 'none', transition: 'border-color 0.15s',
              opacity: isGenerating ? 0.6 : 1,
            }}
            onFocus={(e) => (e.target.style.borderColor = 'var(--accent)')}
            onBlur={(e) => (e.target.style.borderColor = 'var(--border)')}
          />
          <button
            onClick={handleSubmit}
            disabled={isGenerating || !input.trim()}
            style={{
              padding: '7px 14px', borderRadius: 4,
              border: '1px solid var(--accent)',
              background: 'var(--accent)', color: '#fff',
              fontSize: 12, cursor: 'pointer',
              fontFamily: 'var(--sans)', transition: 'all 0.15s',
              opacity: (isGenerating || !input.trim()) ? 0.5 : 1,
            }}
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
