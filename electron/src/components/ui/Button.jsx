import React from 'react';

/**
 * Shared button component. Variants: primary, ghost, danger, icon.
 * All styling is via CSS classes — no inline styles.
 */
export function Button({
  variant = 'ghost',
  size = 'md',
  disabled = false,
  onClick,
  title,
  className = '',
  children,
  type = 'button',
}) {
  const classes = [
    'btn',
    `btn-${variant}`,
    size === 'sm' ? 'btn-sm' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      type={type}
      className={classes}
      disabled={disabled}
      onClick={onClick}
      title={title}
    >
      {children}
    </button>
  );
}
