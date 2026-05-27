import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

/**
 * Portal-based modal. Overlay click and ESC key close it.
 * Focus is trapped inside while open.
 */
export function Modal({ isOpen, onClose, title, children, width = 480 }) {
  const boxRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return;

    const onKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (isOpen && boxRef.current) {
      boxRef.current.focus();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return createPortal(
    <div
      className="modal-overlay"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        ref={boxRef}
        className="modal-box"
        style={{ maxWidth: width }}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
      >
        <div className="modal-header">
          <span className="modal-title">{title}</span>
          <button className="modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>
        {children}
      </div>
    </div>,
    document.body
  );
}
