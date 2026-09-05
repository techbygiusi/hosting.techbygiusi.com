import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { wikiApi, getErrorMessage } from '../services/api';
import MarkdownView from './MarkdownView';

const TEXT = {
  en: {
    title: 'Wiki',
    empty: 'No wiki articles have been published yet.',
    search: 'Search articles',
    noMatches: 'No article matches your search.',
    selectPrompt: 'Select an article to start reading.',
    loadFailed: 'The wiki could not be loaded.',
    articleFailed: 'The article could not be loaded.',
    updated: 'Last updated',
    fallbackNotice: 'This article is currently only available in English.',
    backToOverview: 'All articles',
    showNavigation: 'Pages',
    closeNavigation: 'Close pages'
  },
  de: {
    title: 'Wiki',
    empty: 'Es wurden noch keine Wiki-Artikel veröffentlicht.',
    search: 'Artikel durchsuchen',
    noMatches: 'Kein Artikel passt zu deiner Suche.',
    selectPrompt: 'Wähle einen Artikel aus, um ihn zu lesen.',
    loadFailed: 'Das Wiki konnte nicht geladen werden.',
    articleFailed: 'Der Artikel konnte nicht geladen werden.',
    updated: 'Zuletzt aktualisiert',
    fallbackNotice: 'Dieser Artikel ist derzeit nur auf Englisch verfügbar.',
    backToOverview: 'Alle Artikel',
    showNavigation: 'Seiten',
    closeNavigation: 'Seiten schließen'
  }
};

function flattenArticles(node) {
  const articles = [...(node.articles || [])];
  for (const child of node.children || []) articles.push(...flattenArticles(child));
  return articles;
}

function WikiTree({ folders, rootArticles, activeSlug, onSelect, query }) {
  const matches = (article) => {
    if (!query) return true;
    const needle = query.toLowerCase();
    return `${article.title} ${article.summary || ''}`.toLowerCase().includes(needle);
  };

  const renderFolder = (folder, depth = 0) => {
    const visibleArticles = (folder.articles || []).filter(matches);
    const childNodes = (folder.children || []).map(child => renderFolder(child, depth + 1)).filter(Boolean);
    if (!visibleArticles.length && !childNodes.length) return null;

    return (
      <li key={`folder-${folder.id}`} className="wiki-tree-folder" style={{ '--wiki-depth': depth }}>
        <span className="wiki-tree-folder-title">{folder.title}</span>
        <ul>
          {visibleArticles.map(article => (
            <li key={article.slug}>
              <button
                type="button"
                className={`wiki-tree-link ${activeSlug === article.slug ? 'active' : ''}`}
                onClick={() => onSelect(article.slug)}
              >
                {article.title}
              </button>
            </li>
          ))}
          {childNodes}
        </ul>
      </li>
    );
  };

  const visibleRoot = (rootArticles || []).filter(matches);
  const folderNodes = (folders || []).map(folder => renderFolder(folder)).filter(Boolean);

  return (
    <ul className="wiki-tree">
      {visibleRoot.map(article => (
        <li key={article.slug}>
          <button
            type="button"
            className={`wiki-tree-link ${activeSlug === article.slug ? 'active' : ''}`}
            onClick={() => onSelect(article.slug)}
          >
            {article.title}
          </button>
        </li>
      ))}
      {folderNodes}
    </ul>
  );
}

export default function WikiBrowser({ language = 'en' }) {
  const text = TEXT[language === 'de' ? 'de' : 'en'];
  const [tree, setTree] = useState({ folders: [], rootArticles: [] });
  const [activeSlug, setActiveSlug] = useState('');
  const [article, setArticle] = useState(null);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [navigationOpen, setNavigationOpen] = useState(false);

  const selectArticle = (slug) => {
    setActiveSlug(slug);
    setNavigationOpen(false);
  };

  const loadTree = useCallback(async () => {
    setLoading(true);
    try {
      const response = await wikiApi.getTree(language);
      setTree(response.data || { folders: [], rootArticles: [] });
      setError('');
    } catch (err) {
      setError(getErrorMessage(err, text.loadFailed));
    } finally {
      setLoading(false);
    }
  }, [language, text.loadFailed]);

  useEffect(() => { loadTree(); }, [loadTree]);

  const allArticles = useMemo(() => {
    const collected = [...(tree.rootArticles || [])];
    for (const folder of tree.folders || []) collected.push(...flattenArticles(folder));
    return collected;
  }, [tree]);

  // Open the first article automatically, and re-resolve the selection when the
  // portal language changes so the reader never lands on an empty pane.
  useEffect(() => {
    if (!allArticles.length) {
      setActiveSlug('');
      setArticle(null);
      return;
    }
    if (!activeSlug || !allArticles.some(item => item.slug === activeSlug)) {
      setActiveSlug(allArticles[0].slug);
    }
  }, [allArticles, activeSlug]);

  useEffect(() => {
    if (!activeSlug) return;
    let active = true;
    wikiApi.getArticle(activeSlug, language)
      .then((response) => { if (active) { setArticle(response.data); setError(''); } })
      .catch((err) => { if (active) setError(getErrorMessage(err, text.articleFailed)); });
    return () => { active = false; };
  }, [activeSlug, language, text.articleFailed]);

  const hasContent = allArticles.length > 0;

  return (
    <section className="panel-card wiki-panel">
      <div className="panel-header wiki-panel-heading">
        <h2>{text.title}</h2>
        {hasContent && (
          <div className="wiki-panel-heading-actions">
            <input
              type="search"
              className="wiki-search-input"
              placeholder={text.search}
              value={query}
              onFocus={() => setNavigationOpen(true)}
              onChange={(event) => { setQuery(event.target.value); setNavigationOpen(true); }}
              aria-label={text.search}
            />
          </div>
        )}
      </div>

      {error && <div className="alert alert-danger">{error}</div>}

      {!loading && !hasContent && !error && <p className="hint-text wiki-empty-state">{text.empty}</p>}

      {hasContent && (
        <div className="wiki-layout wiki-floating-navigation-layout">
          <button
            type="button"
            className={`wiki-floating-menu-button ${navigationOpen ? 'is-open' : ''}`}
            onClick={() => setNavigationOpen(open => !open)}
            aria-expanded={navigationOpen}
            aria-controls="wiki-navigation"
            title={text.showNavigation}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M5 6h14M5 12h14M5 18h14" />
            </svg>
            <span>{text.showNavigation}</span>
          </button>

          {navigationOpen && (
            <div className="wiki-floating-menu-popover" role="dialog" aria-label={text.showNavigation}>
              <div className="wiki-floating-menu-head">
                <strong>{text.showNavigation}</strong>
                <button type="button" className="wiki-floating-menu-close" onClick={() => setNavigationOpen(false)} aria-label={text.closeNavigation}>×</button>
              </div>
              <nav id="wiki-navigation" className="wiki-sidebar wiki-floating-sidebar" aria-label={text.title}>
                <WikiTree
                  folders={tree.folders}
                  rootArticles={tree.rootArticles}
                  activeSlug={activeSlug}
                  onSelect={selectArticle}
                  query={query.trim()}
                />
                {query.trim() && !allArticles.some(item => `${item.title} ${item.summary || ''}`.toLowerCase().includes(query.trim().toLowerCase())) && (
                  <p className="hint-text wiki-no-matches">{text.noMatches}</p>
                )}
              </nav>
            </div>
          )}

          <article className="wiki-article">
            <div className="wiki-article-inner">
            {!article && <p className="hint-text">{text.selectPrompt}</p>}
            {article && (
              <>
                {article.isTranslated === false && (
                  <div className="wiki-fallback-note" role="status">
                    <span className="wiki-fallback-icon" aria-hidden="true">i</span>
                    <span>{text.fallbackNotice}</span>
                  </div>
                )}
                <header className="wiki-article-header">
                  <h3>{article.title}</h3>
                  {article.summary && <p className="wiki-article-summary">{article.summary}</p>}
                  {article.updatedAt && (
                    <small className="wiki-article-meta">
                      {text.updated}: {new Date(String(article.updatedAt).replace(' ', 'T') + 'Z').toLocaleString(language === 'de' ? 'de-DE' : 'en-GB')}
                    </small>
                  )}
                </header>
                <MarkdownView content={article.body} language={language} />
              </>
            )}
            </div>
          </article>
        </div>
      )}
    </section>
  );
}
