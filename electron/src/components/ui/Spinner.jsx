import React from 'react';

export function Spinner({ size = 14 }) {
  return (
    <div
      className="spinner"
      style={{ width: size, height: size }}
      role="status"
      aria-label="Loading"
    />
  );
}
