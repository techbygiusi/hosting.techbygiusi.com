import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { wikiApi, getErrorMessage } from '../services/api';
import MarkdownView from './MarkdownView';

const LANGUAGES = ['en', 'de'];

const TEXT = {
  en: {
    title: 'Wiki',
    intro: 'Build the folder structure and write the articles your users can read.',
    structure: 'Structure',
    newFolder: 'New folder',
    newArticle: 'New article',
    folderName: 'Folder name',
    rootLevel: 'Top level',
    parentFolder: 'Parent folder',
    save: 'Save',
    saving: 'Saving...',
    cancel: 'Cancel',
    edit: 'Edit',
    remove: 'Delete',
    deleteFolderConfirm: 'Delete this folder? Articles inside it are moved to the top level.',
    deleteArticleConfirm: 'Delete this article including all translations?',
    noArticles: 'No articles yet. Create the first one.',
    selectArticle: 'Select an article on the left or create a new one.',
    articleTitle: 'Title',
    summary: 'Short description',
    body: 'Content',
    format: 'Editor',
    markdown: 'Markdown',
    plainText: 'Plain text',
    preview: 'Preview',
    write: 'Write',
    published: 'Published',
    draft: 'Draft',
    publishToggle: 'Publish this language',
    translationEmpty: 'No content in this language yet. Add a title to create the translation.',
    insertImage: 'Insert image',
    uploading: 'Uploading...',
    imageHint: 'You can also paste a screenshot directly into the editor.',
    location: 'Location',
    slug: 'URL name',
    saved: 'Saved.',
    saveFailed: 'Could not be saved.',
    loadFailed: 'The wiki content could not be loaded.',
    uploadFailed: 'The image could not be uploaded.',
    titleRequired: 'Enter a title in at least one language.',
    unsaved: 'Unsaved changes',
    languageStatus: (published) => (published ? 'Published' : 'Draft')
  },
  de: {
    title: 'Wiki',
    intro: 'Lege die Ordnerstruktur an und schreibe die Artikel, die deine Benutzer lesen können.',
    structure: 'Struktur',
    newFolder: 'Neuer Ordner',
    newArticle: 'Neuer Artikel',
    folderName: 'Ordnername',
    rootLevel: 'Oberste Ebene',
    parentFolder: 'Übergeordneter Ordner',
    save: 'Speichern',
    saving: 'Speichert...',
    cancel: 'Abbrechen',
    edit: 'Bearbeiten',
    remove: 'Löschen',
    deleteFolderConfirm: 'Diesen Ordner löschen? Enthaltene Artikel werden auf die oberste Ebene verschoben.',
    deleteArticleConfirm: 'Diesen Artikel inklusive aller Übersetzungen löschen?',
    noArticles: 'Noch keine Artikel. Lege den ersten an.',
    selectArticle: 'Wähle links einen Artikel aus oder lege einen neuen an.',
    articleTitle: 'Titel',
    summary: 'Kurzbeschreibung',
    body: 'Inhalt',
    format: 'Editor',
    markdown: 'Markdown',
    plainText: 'Nur Text',
    preview: 'Vorschau',
    write: 'Schreiben',
    published: 'Veröffentlicht',
    draft: 'Entwurf',
    publishToggle: 'Diese Sprache veröffentlichen',
    translationEmpty: 'Noch kein Inhalt in dieser Sprache. Gib einen Titel ein, um die Übersetzung anzulegen.',
    insertImage: 'Bild einfügen',
    uploading: 'Lädt hoch...',
    imageHint: 'Du kannst einen Screenshot auch direkt in den Editor einfügen.',
    location: 'Ablage',
    slug: 'URL-Name',
    saved: 'Gespeichert.',
    saveFailed: 'Konnte nicht gespeichert werden.',
    loadFailed: 'Die Wiki-Inhalte konnten nicht geladen werden.',
    uploadFailed: 'Das Bild konnte nicht hochgeladen werden.',
    titleRequired: 'Gib in mindestens einer Sprache einen Titel ein.',
    unsaved: 'Ungespeicherte Änderungen',
    languageStatus: (published) => (published ? 'Veröffentlicht' : 'Entwurf')
  }
};

const emptyTranslation = () => ({ title: '', summary: '', body: '', format: 'markdown', isPublished: false });

function buildDraft(article) {
  const translations = {};
  for (const language of LANGUAGES) {
    const existing = (article?.translations || []).find(item => item.language === language);
    translations[language] = existing
      ? {
        title: existing.title || '',
        summary: existing.summary || '',
        body: existing.body || '',
        format: existing.format === 'text' ? 'text' : 'markdown',
        isPublished: Number(existing.is_published) === 1
      }
      : emptyTranslation();
  }
  return {
    id: article?.id || null,
    folderId: article?.folder_id || null,
    slug: article?.slug || '',
    translations
  };
}

/** Flatten the folder tree into indented options for the location selects. */
function folderOptions(folders, language) {
  const byParent = new Map();
  for (const folder of folders) {
    const key = folder.parent_id || 0;
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key).push(folder);
  }
  const titleOf = (folder) => {
    const translations = folder.translations || [];
    const match = translations.find(item => item.language === language)
      || translations.find(item => item.language === 'en')
      || translations[0];
    return match?.title || folder.slug;
  };
  const output = [];
  const walk = (parentId, depth) => {
    for (const folder of (byParent.get(parentId) || []).sort((a, b) => a.position - b.position)) {
      output.push({ id: folder.id, label: `${'— '.repeat(depth)}${titleOf(folder)}`, depth });
      walk(folder.id, depth + 1);
    }
  };
  walk(0, 0);
  return output;
}

export default function WikiAdminPanel({ language = 'en' }) {
  const uiLanguage = language === 'de' ? 'de' : 'en';
  const text = TEXT[uiLanguage];

  const [folders, setFolders] = useState([]);
  const [articles, setArticles] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [draft, setDraft] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [editorLanguage, setEditorLanguage] = useState('en');
  const [previewMode, setPreviewMode] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [folderForm, setFolderForm] = useState(null);
  const bodyRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const response = await wikiApi.getAdminContent();
      setFolders(response.data?.folders || []);
      setArticles(response.data?.articles || []);
      setError('');
    } catch (err) {
      setError(getErrorMessage(err, text.loadFailed));
    }
  }, [text.loadFailed]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!selectedId) { setDraft(null); return; }
    const article = articles.find(item => item.id === selectedId);
    if (article) { setDraft(buildDraft(article)); setDirty(false); }
  }, [selectedId, articles]);

  const options = useMemo(() => folderOptions(folders, uiLanguage), [folders, uiLanguage]);

  const titleOf = useCallback((article) => {
    const translations = article.translations || [];
    const match = translations.find(item => item.language === uiLanguage)
      || translations.find(item => item.language === 'en')
      || translations[0];
    return match?.title || article.slug;
  }, [uiLanguage]);

  const flash = (message) => {
    setNotice(message);
    setTimeout(() => setNotice(''), 2500);
  };

  /* ----------------------------------------------------------- folder ops */

  const submitFolder = async () => {
    if (!folderForm) return;
    const titles = folderForm.titles || {};
    if (!LANGUAGES.some(lang => String(titles[lang] || '').trim())) {
      setError(text.titleRequired);
      return;
    }
    setBusy('folder');
    try {
      if (folderForm.id) {
        await wikiApi.updateFolder(folderForm.id, { parentId: folderForm.parentId || null, titles });
      } else {
        await wikiApi.createFolder({ parentId: folderForm.parentId || null, titles });
      }
      setFolderForm(null);
      await load();
      flash(text.saved);
      setError('');
    } catch (err) {
      setError(getErrorMessage(err, text.saveFailed));
    } finally {
      setBusy('');
    }
  };

  const removeFolder = async (folderId) => {
    if (!window.confirm(text.deleteFolderConfirm)) return;
    setBusy(`folder-${folderId}`);
    try {
      await wikiApi.deleteFolder(folderId);
      await load();
    } catch (err) {
      setError(getErrorMessage(err, text.saveFailed));
    } finally {
      setBusy('');
    }
  };

  /* ---------------------------------------------------------- article ops */

  const createArticle = async () => {
    setBusy('article');
    try {
      const response = await wikiApi.createArticle({
        folderId: null,
        translations: { en: { title: uiLanguage === 'de' ? 'Neuer Artikel' : 'New article' } }
      });
      await load();
      setSelectedId(response.data?.id || null);
      setEditorLanguage('en');
      setError('');
    } catch (err) {
      setError(getErrorMessage(err, text.saveFailed));
    } finally {
      setBusy('');
    }
  };

  const saveArticle = async () => {
    if (!draft) return;
    if (!LANGUAGES.some(lang => String(draft.translations[lang]?.title || '').trim())) {
      setError(text.titleRequired);
      return;
    }
    setBusy('save');
    try {
      await wikiApi.updateArticle(draft.id, {
        folderId: draft.folderId,
        slug: draft.slug || undefined,
        translations: draft.translations
      });
      await load();
      setDirty(false);
      flash(text.saved);
      setError('');
    } catch (err) {
      setError(getErrorMessage(err, text.saveFailed));
    } finally {
      setBusy('');
    }
  };

  const removeArticle = async (articleId) => {
    if (!window.confirm(text.deleteArticleConfirm)) return;
    setBusy(`article-${articleId}`);
    try {
      await wikiApi.deleteArticle(articleId);
      setSelectedId(null);
      setDraft(null);
      await load();
    } catch (err) {
      setError(getErrorMessage(err, text.saveFailed));
    } finally {
      setBusy('');
    }
  };

  const patchTranslation = (patch) => {
    setDraft(current => ({
      ...current,
      translations: {
        ...current.translations,
        [editorLanguage]: { ...current.translations[editorLanguage], ...patch }
      }
    }));
    setDirty(true);
  };

  /* ------------------------------------------------------------- images */

  /** Insert markdown at the caret so a pasted screenshot lands where expected. */
  const insertAtCaret = (snippet) => {
    const field = bodyRef.current;
    const current = draft.translations[editorLanguage].body || '';
    if (!field) {
      patchTranslation({ body: `${current}\n${snippet}\n` });
      return;
    }
    const start = field.selectionStart ?? current.length;
    const end = field.selectionEnd ?? current.length;
    const next = `${current.slice(0, start)}${snippet}${current.slice(end)}`;
    patchTranslation({ body: next });
    requestAnimationFrame(() => {
      field.focus();
      const caret = start + snippet.length;
      field.setSelectionRange(caret, caret);
    });
  };

  const uploadImage = async (file) => {
    if (!file) return;
    setBusy('upload');
    try {
      const response = await wikiApi.uploadImage(file);
      const url = response.data?.url;
      if (url) insertAtCaret(`![${file.name || 'screenshot'}](${url})`);
      setError('');
    } catch (err) {
      setError(getErrorMessage(err, text.uploadFailed));
    } finally {
      setBusy('');
    }
  };

  const handlePaste = (event) => {
    const item = [...(event.clipboardData?.items || [])].find(entry => entry.type.startsWith('image/'));
    if (!item) return;
    const file = item.getAsFile();
    if (!file) return;
    event.preventDefault();
    uploadImage(file);
  };

  const rootArticles = articles.filter(article => !article.folder_id);
  const articlesIn = (folderId) => articles.filter(article => Number(article.folder_id) === Number(folderId));
  const translation = draft?.translations?.[editorLanguage];

  return (
    <section className="panel-card wiki-admin-panel">
      <div className="wiki-panel-heading">
        <div>
          <h2>{text.title}</h2>
          <p className="hint-text">{text.intro}</p>
        </div>
        <div className="wiki-admin-heading-actions">
          <button type="button" className="btn-secondary btn-small" onClick={() => setFolderForm({ id: null, parentId: null, titles: {} })}>
            {text.newFolder}
          </button>
          <button type="button" className="btn-primary btn-small" onClick={createArticle} disabled={busy === 'article'}>
            {text.newArticle}
          </button>
        </div>
      </div>

      {error && <div className="alert alert-danger">{error}</div>}
      {notice && <div className="alert alert-success">{notice}</div>}

      {folderForm && (
        <div className="wiki-folder-form panel-inset">
          <h4>{folderForm.id ? text.edit : text.newFolder}</h4>
          <div className="wiki-folder-form-grid">
            {LANGUAGES.map(lang => (
              <label key={lang} className="form-group">
                <span>{text.folderName} ({lang.toUpperCase()})</span>
                <input
                  type="text"
                  value={folderForm.titles?.[lang] || ''}
                  onChange={(event) => setFolderForm(current => ({
                    ...current,
                    titles: { ...current.titles, [lang]: event.target.value }
                  }))}
                />
              </label>
            ))}
            <label className="form-group">
              <span>{text.parentFolder}</span>
              <select
                value={folderForm.parentId || ''}
                onChange={(event) => setFolderForm(current => ({ ...current, parentId: event.target.value || null }))}
              >
                <option value="">{text.rootLevel}</option>
                {options.filter(option => option.id !== folderForm.id).map(option => (
                  <option key={option.id} value={option.id}>{option.label}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="wiki-folder-form-actions">
            <button type="button" className="btn-primary btn-small" onClick={submitFolder} disabled={busy === 'folder'}>
              {busy === 'folder' ? text.saving : text.save}
            </button>
            <button type="button" className="btn-secondary btn-small" onClick={() => setFolderForm(null)}>{text.cancel}</button>
          </div>
        </div>
      )}

      <div className="wiki-admin-layout">
        <aside className="wiki-admin-tree">
          <h4>{text.structure}</h4>
          {!articles.length && !folders.length && <p className="hint-text">{text.noArticles}</p>}

          <ul className="wiki-tree">
            {rootArticles.map(article => (
              <li key={article.id}>
                <button
                  type="button"
                  className={`wiki-tree-link ${selectedId === article.id ? 'active' : ''}`}
                  onClick={() => setSelectedId(article.id)}
                >
                  {titleOf(article)}
                </button>
              </li>
            ))}
            {options.map(option => (
              <li key={option.id} className="wiki-tree-folder" style={{ '--wiki-depth': option.depth }}>
                <div className="wiki-admin-folder-row">
                  <span className="wiki-tree-folder-title">{option.label}</span>
                  <span className="wiki-admin-folder-actions">
                    <button
                      type="button"
                      className="btn-secondary btn-tiny"
                      onClick={() => {
                        const folder = folders.find(item => item.id === option.id);
                        const titles = {};
                        for (const item of folder?.translations || []) titles[item.language] = item.title;
                        setFolderForm({ id: option.id, parentId: folder?.parent_id || null, titles });
                      }}
                    >
                      {text.edit}
                    </button>
                    <button
                      type="button"
                      className="btn-danger btn-tiny"
                      onClick={() => removeFolder(option.id)}
                      disabled={busy === `folder-${option.id}`}
                    >
                      {text.remove}
                    </button>
                  </span>
                </div>
                <ul>
                  {articlesIn(option.id).map(article => (
                    <li key={article.id}>
                      <button
                        type="button"
                        className={`wiki-tree-link ${selectedId === article.id ? 'active' : ''}`}
                        onClick={() => setSelectedId(article.id)}
                      >
                        {titleOf(article)}
                      </button>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </aside>

        <div className="wiki-admin-editor">
          {!draft && <p className="hint-text">{text.selectArticle}</p>}

          {draft && (
            <>
              <div className="wiki-editor-toolbar">
                <div className="wiki-language-tabs" role="tablist">
                  {LANGUAGES.map(lang => {
                    const entry = draft.translations[lang];
                    const filled = String(entry?.title || '').trim().length > 0;
                    return (
                      <button
                        key={lang}
                        type="button"
                        role="tab"
                        aria-selected={editorLanguage === lang}
                        className={`wiki-language-tab ${editorLanguage === lang ? 'active' : ''}`}
                        onClick={() => { setEditorLanguage(lang); setPreviewMode(false); }}
                      >
                        {lang.toUpperCase()}
                        <span className={`wiki-language-flag ${entry?.isPublished ? 'published' : 'draft'}`}>
                          {filled ? text.languageStatus(entry?.isPublished) : '—'}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <div className="wiki-editor-toolbar-actions">
                  {dirty && <span className="wiki-dirty-flag">{text.unsaved}</span>}
                  <button type="button" className="btn-primary btn-small" onClick={saveArticle} disabled={busy === 'save'}>
                    {busy === 'save' ? text.saving : text.save}
                  </button>
                  <button
                    type="button"
                    className="btn-danger btn-small"
                    onClick={() => removeArticle(draft.id)}
                    disabled={busy === `article-${draft.id}`}
                  >
                    {text.remove}
                  </button>
                </div>
              </div>

              <div className="wiki-editor-meta">
                <label className="form-group">
                  <span>{text.location}</span>
                  <select
                    value={draft.folderId || ''}
                    onChange={(event) => { setDraft(current => ({ ...current, folderId: event.target.value || null })); setDirty(true); }}
                  >
                    <option value="">{text.rootLevel}</option>
                    {options.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
                  </select>
                </label>
                <label className="form-group">
                  <span>{text.slug}</span>
                  <input
                    type="text"
                    value={draft.slug}
                    onChange={(event) => { setDraft(current => ({ ...current, slug: event.target.value })); setDirty(true); }}
                  />
                </label>
              </div>

              <div className="wiki-editor-fields">
                <label className="form-group">
                  <span>{text.articleTitle} ({editorLanguage.toUpperCase()})</span>
                  <input
                    type="text"
                    value={translation?.title || ''}
                    onChange={(event) => patchTranslation({ title: event.target.value })}
                  />
                </label>
                <label className="form-group">
                  <span>{text.summary}</span>
                  <input
                    type="text"
                    value={translation?.summary || ''}
                    onChange={(event) => patchTranslation({ summary: event.target.value })}
                  />
                </label>
              </div>

              {!String(translation?.title || '').trim() && (
                <p className="hint-text">{text.translationEmpty}</p>
              )}

              <div className="wiki-editor-controls">
                <div className="wiki-format-toggle">
                  <span>{text.format}:</span>
                  <button
                    type="button"
                    className={translation?.format !== 'text' ? 'active' : ''}
                    onClick={() => patchTranslation({ format: 'markdown' })}
                  >
                    {text.markdown}
                  </button>
                  <button
                    type="button"
                    className={translation?.format === 'text' ? 'active' : ''}
                    onClick={() => patchTranslation({ format: 'text' })}
                  >
                    {text.plainText}
                  </button>
                </div>

                <div className="wiki-editor-control-actions">
                  <label className="btn-secondary btn-small wiki-upload-button">
                    {busy === 'upload' ? text.uploading : text.insertImage}
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml"
                      onChange={(event) => { uploadImage(event.target.files?.[0]); event.target.value = ''; }}
                      hidden
                    />
                  </label>
                  <button
                    type="button"
                    className={`btn-secondary btn-small ${previewMode ? 'active' : ''}`}
                    onClick={() => setPreviewMode(value => !value)}
                  >
                    {previewMode ? text.write : text.preview}
                  </button>
                  <label className="wiki-publish-toggle">
                    <input
                      type="checkbox"
                      checked={!!translation?.isPublished}
                      onChange={(event) => patchTranslation({ isPublished: event.target.checked })}
                    />
                    <span>{text.publishToggle}</span>
                  </label>
                </div>
              </div>

              {previewMode ? (
                <div className="wiki-preview-pane">
                  <MarkdownView content={translation?.body || ''} format={translation?.format} language={uiLanguage} />
                </div>
              ) : (
                <textarea
                  ref={bodyRef}
                  className="wiki-body-editor"
                  value={translation?.body || ''}
                  onChange={(event) => patchTranslation({ body: event.target.value })}
                  onPaste={handlePaste}
                  rows={20}
                  spellCheck={false}
                  placeholder={text.body}
                />
              )}
              <small className="hint-text">{text.imageHint}</small>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
