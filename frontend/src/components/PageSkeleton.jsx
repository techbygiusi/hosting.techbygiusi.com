import React from 'react';

export default function PageSkeleton({ variant = 'dashboard', compact = false }) {
  const count = variant === 'table' ? 7 : variant === 'settings' ? 5 : 6;
  return (
    <div className={`page-skeleton page-skeleton-${variant} ${compact ? 'compact' : ''}`} aria-hidden="true">
      <div className="skeleton-line skeleton-title" />
      <div className="skeleton-line skeleton-subtitle" />
      <div className="skeleton-grid">
        {Array.from({ length: count }, (_, index) => (
          <div className="skeleton-card" key={index}>
            <span className="skeleton-line skeleton-small" />
            <span className="skeleton-line skeleton-medium" />
            <span className="skeleton-line skeleton-long" />
          </div>
        ))}
      </div>
    </div>
  );
}
