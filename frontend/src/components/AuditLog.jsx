import React, { useEffect, useState } from 'react';
import { adminApi, getErrorMessage } from '../services/api';
import { EmptyState, InlineNotice, SectionCard } from './UiBits';

function formatAction(action) {
  const value = String(action || '').replace(/[._-]+/g, ' ');
  return value.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default function AuditLog() {
  const [entries, setEntries] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0, limit: 50 });
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = async (nextPage = page, nextSearch = search) => {
    setLoading(true);
    setError('');
    try {
      const response = await adminApi.getAudit({ page: nextPage, search: nextSearch });
      setEntries(response.data?.entries || []);
      setPagination(response.data?.pagination || { page: nextPage, pages: 1, total: 0, limit: 50 });
    } catch (err) {
      setError(getErrorMessage(err, 'Audit log could not be loaded.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(page, search); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [page, search]);

  const applySearch = (event) => {
    event.preventDefault();
    setPage(1);
    setSearch(draft.trim());
  };

  return (
    <div className="settings-layout-clean">
      {error ? <InlineNotice tone="danger">{error}</InlineNotice> : null}
      <SectionCard action={<button type="button" className="btn-secondary" onClick={() => load(page, search)} disabled={loading}>{loading ? 'Refreshing…' : 'Refresh'}</button>}>
        <form className="audit-toolbar-clean" onSubmit={applySearch}>
          <input className="search-clean" value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Search audit entries…" />
          <button type="submit" className="btn-primary">Search</button>
          {(draft || search) ? <button type="button" className="btn-secondary" onClick={() => { setDraft(''); setSearch(''); setPage(1); }}>Clear</button> : null}
        </form>

        <div className="audit-summary-clean">{pagination.total || 0} entries · {pagination.limit || 50} per page</div>

        {!loading && !entries.length ? <EmptyState title="No audit entries" text="No entries match the current filter." /> : null}
        <div className="audit-list-clean">
          {entries.map((entry) => (
            <article key={entry.id} className="audit-entry-clean">
              <div className="audit-entry-main-clean">
                <strong>{formatAction(entry.action)}</strong>
                <p>{entry.detail || entry.target || 'No additional detail'}</p>
              </div>
              <div className="audit-entry-meta-clean">
                <span>{entry.user_email || entry.email || entry.actor || 'System'}</span>
                <span>{entry.ip_address || entry.ip || '—'}</span>
                <span>{entry.created_at ? new Date(String(entry.created_at).replace(' ', 'T') + 'Z').toLocaleString() : '—'}</span>
              </div>
            </article>
          ))}
        </div>

        <div className="audit-pagination-clean">
          <button type="button" className="btn-secondary" disabled={pagination.page <= 1 || loading} onClick={() => setPage((current) => Math.max(1, current - 1))}>Previous</button>
          <span>Page {pagination.page || 1} of {pagination.pages || 1}</span>
          <button type="button" className="btn-secondary" disabled={(pagination.page || 1) >= (pagination.pages || 1) || loading} onClick={() => setPage((current) => Math.min(pagination.pages || 1, current + 1))}>Next</button>
        </div>
      </SectionCard>
    </div>
  );
}
