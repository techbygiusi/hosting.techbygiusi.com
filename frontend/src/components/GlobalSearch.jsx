import React, { useEffect, useMemo, useRef, useState } from 'react';
import { SearchIcon, CloseIcon, ChevronRightIcon } from './Icons';

function normalize(value) {
  return String(value || '').trim().toLowerCase();
}

function scoreItem(item, query) {
  const q = normalize(query);
  if (!q) return 1;
  const label = normalize(item.label);
  const description = normalize(item.description);
  const category = normalize(item.category);
  const keywords = normalize(item.keywords);
  if (label === q) return 100;
  if (label.startsWith(q)) return 80;
  if (label.includes(q)) return 65;
  if (keywords.includes(q)) return 45;
  if (description.includes(q)) return 30;
  if (category.includes(q)) return 20;
  return 0;
}

export default function GlobalSearch({ items = [], placeholder = 'Search…', compactPlaceholder = 'Search…' }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const handleKey = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', handleKey);
    const timer = window.setTimeout(() => inputRef.current?.focus(), 40);
    return () => {
      document.removeEventListener('keydown', handleKey);
      window.clearTimeout(timer);
    };
  }, [open]);

  const results = useMemo(() => {
    return items
      .map((item) => ({ ...item, _score: scoreItem(item, query) }))
      .filter((item) => item._score > 0)
      .sort((a, b) => b._score - a._score || String(a.label).localeCompare(String(b.label)))
      .slice(0, query.trim() ? 14 : 9);
  }, [items, query]);

  const choose = (item) => {
    setOpen(false);
    setQuery('');
    item.onSelect?.();
  };

  return (
    <>
      <button type="button" className="global-search-trigger" onClick={() => setOpen(true)}>
        <SearchIcon size={17} />
        <span className="global-search-placeholder desktop-only-inline">{placeholder}</span>
        <span className="global-search-placeholder mobile-only-inline">{compactPlaceholder}</span>
        <kbd>Ctrl K</kbd>
      </button>

      {open ? (
        <div className="global-search-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
          <section className="global-search-dialog" role="dialog" aria-modal="true" aria-label="Portal search">
            <div className="global-search-input-row">
              <SearchIcon size={21} />
              <input
                ref={inputRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={placeholder}
                aria-label={placeholder}
              />
              <button type="button" className="icon-button search-close-button" onClick={() => setOpen(false)} aria-label="Close search">
                <CloseIcon size={18} />
              </button>
            </div>

            <div className="global-search-results">
              <div className="global-search-results-head">
                <span>{query.trim() ? 'Results' : 'Quick access'}</span>
                <small>{results.length} {results.length === 1 ? 'result' : 'results'}</small>
              </div>

              {results.length ? (
                <div className="global-search-result-list">
                  {results.map((item) => {
                    const Icon = item.icon;
                    return (
                      <button type="button" className="global-search-result" key={item.id} onClick={() => choose(item)}>
                        <span className="global-search-result-icon">{Icon ? <Icon size={19} /> : <SearchIcon size={18} />}</span>
                        <span className="global-search-result-copy">
                          <strong>{item.label}</strong>
                          <small>{item.description || item.category || ''}</small>
                        </span>
                        <span className="global-search-result-category">{item.category || ''}</span>
                        <ChevronRightIcon size={17} />
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="global-search-empty">
                  <SearchIcon size={24} />
                  <strong>No matches</strong>
                  <span>Try a service, user, cluster or menu name.</span>
                </div>
              )}
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
