import React from 'react';

export function StatCard({ label, value, hint, tone = 'neutral' }) {
  return (
    <div className={`stat-card tone-${tone}`}>
      <span className="stat-label">{label}</span>
      <strong className="stat-value">{value}</strong>
      {hint ? <small className="stat-hint">{hint}</small> : null}
    </div>
  );
}

export function SectionCard({ title, subtitle, action, children, className = '' }) {
  return (
    <section className={`section-card ${className}`.trim()}>
      {(title || subtitle || action) ? (
        <header className="section-card-header">
          <div>
            {title ? <h2>{title}</h2> : null}
            {subtitle ? <p>{subtitle}</p> : null}
          </div>
          {action ? <div className="section-card-action">{action}</div> : null}
        </header>
      ) : null}
      {children}
    </section>
  );
}

export function EmptyState({ title, text, action }) {
  return (
    <div className="empty-state-clean">
      <h3>{title}</h3>
      <p>{text}</p>
      {action ? <div className="empty-state-action">{action}</div> : null}
    </div>
  );
}

export function StatusBadge({ status }) {
  const normalized = String(status || '').toLowerCase();
  let tone = 'neutral';
  let label = status || 'Unknown';

  if (normalized.includes('run') || normalized === 'online' || normalized === 'ok') {
    tone = 'success';
    label = 'Running';
  } else if (normalized.includes('stop') || normalized === 'offline') {
    tone = 'danger';
    label = 'Stopped';
  } else if (normalized.includes('maint')) {
    tone = 'warning';
    label = 'Maintenance';
  } else if (normalized.includes('pend') || normalized.includes('build') || normalized.includes('start')) {
    tone = 'neutral';
    label = status;
  }

  return <span className={`status-badge ${tone}`}>{label}</span>;
}

export function InlineNotice({ tone = 'info', children }) {
  return <div className={`inline-notice ${tone}`}>{children}</div>;
}
