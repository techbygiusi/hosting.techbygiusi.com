import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { wikiApi, getErrorMessage } from '../services/api';

const LANGUAGES = ['en', 'de'];

const TEXT = {
  en: {
    title: 'Wiki',
    intro: 'Build the folder structure and write the articles your users can read.',
    structure: 'Structure',
    newFolder: 'New folder',
    newArticle: 'New article',
    newSubfolder: 'New folder inside this folder',
    newArticleHere: 'New article in this folder',
    folderShort: 'Folder',
    articleShort: 'Article',
    emptyFolder: 'This folder is still empty.',
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
    editorHint: 'Articles open in the full-screen editor.',
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
    newSubfolder: 'Neuer Ordner in diesem Ordner',
    newArticleHere: 'Neuer Artikel in diesem Ordner',
    folderShort: 'Ordner',
    articleShort: 'Artikel',
    emptyFolder: 'Dieser Ordner ist noch leer.',
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
    editorHint: 'Artikel öffnen sich im Vollbild-Editor.',
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

// Plain text is the default editor; Markdown is opt-in per language.
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

  const navigate = useNavigate();
  const openEditor = useCallback((id) => navigate(`/admin/wiki/${id}`), [navigate]);

  const [folders, setFolders] = useState([]);
  const [articles, setArticles] = useState([]);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [folderForm, setFolderForm] = useState(null);

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

  const createArticle = async (folderId = null) => {
    setBusy('article');
    try {
      const response = await wikiApi.createArticle({
        folderId: folderId || null,
        translations: { en: { title: uiLanguage === 'de' ? 'Neuer Artikel' : 'New article' } }
      });
      const newId = response.data?.id;
      await load();
      setError('');
      if (newId) openEditor(newId);
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
      await load();
    } catch (err) {
      setError(getErrorMessage(err, text.saveFailed));
    } finally {
      setBusy('');
    }
  };



  const rootArticles = articles.filter(article => !article.folder_id);
  const articlesIn = (folderId) => articles.filter(article => Number(article.folder_id) === Number(folderId));
  const childFolders = (parentId) => folders
    .filter(folder => (folder.parent_id || null) === (parentId === null ? null : Number(parentId)))
    .sort((a, b) => a.position - b.position);

  const articleRow = (article) => (
    <li key={`a-${article.id}`}>
      <div className="wiki-admin-article-row">
        <button type="button" className="wiki-tree-link" onClick={() => openEditor(article.id)}>
          {titleOf(article)}
        </button>
        <button
          type="button"
          className="btn-danger btn-tiny"
          onClick={() => removeArticle(article.id)}
          disabled={busy === `article-${article.id}`}
          title={text.remove}
        >
          {text.remove}
        </button>
      </div>
    </li>
  );

  /**
   * Render one level of the structure. Folders nest visually instead of being
   * flattened, and each folder carries its own "new subfolder" / "new article"
   * actions so content can be created directly where it belongs.
   */
  const renderBranch = (parentId, depth) => {
    const subFolders = childFolders(parentId);
    const ownArticles = parentId === null ? rootArticles : articlesIn(parentId);
    if (!subFolders.length && !ownArticles.length && depth > 0) {
      return <p className="hint-text wiki-empty-folder">{text.emptyFolder}</p>;
    }

    return (
      <ul className="wiki-tree">
        {ownArticles.map(articleRow)}
        {subFolders.map(folder => {
          const titles = {};
          for (const item of folder.translations || []) titles[item.language] = item.title;
          const label = titles[uiLanguage] || titles.en || folder.slug;
          return (
            <li key={`f-${folder.id}`} className="wiki-tree-folder" style={{ '--wiki-depth': depth }}>
              <div className="wiki-admin-folder-row">
                <span className="wiki-tree-folder-title">{label}</span>
                <span className="wiki-admin-folder-actions">
                  <button
                    type="button"
                    className="btn-secondary btn-tiny"
                    title={text.newSubfolder}
                    onClick={() => setFolderForm({ id: null, parentId: folder.id, titles: {} })}
                  >
                    + {text.folderShort}
                  </button>
                  <button
                    type="button"
                    className="btn-secondary btn-tiny"
                    title={text.newArticleHere}
                    onClick={() => createArticle(folder.id)}
                    disabled={busy === 'article'}
                  >
                    + {text.articleShort}
                  </button>
                  <button
                    type="button"
                    className="btn-secondary btn-tiny"
                    title={text.edit}
                    onClick={() => setFolderForm({ id: folder.id, parentId: folder.parent_id || null, titles })}
                  >
                    {text.edit}
                  </button>
                  <button
                    type="button"
                    className="btn-danger btn-tiny"
                    title={text.remove}
                    onClick={() => removeFolder(folder.id)}
                    disabled={busy === `folder-${folder.id}`}
                  >
                    {text.remove}
                  </button>
                </span>
              </div>
              {renderBranch(folder.id, depth + 1)}
            </li>
          );
        })}
      </ul>
    );
  };

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
          <button type="button" className="btn-primary btn-small" onClick={() => createArticle(null)} disabled={busy === 'article'}>
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

          {renderBranch(null, 0)}
        </aside>

        <div className="wiki-admin-editor">
          <p className="hint-text">{text.selectArticle}</p>
          <p className="hint-text">{text.editorHint}</p>
        </div>
      </div>
    </section>
  );
}
