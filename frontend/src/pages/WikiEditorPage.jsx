import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import MarkdownView from '../components/MarkdownView';
import { wikiApi, getErrorMessage } from '../services/api';
import { readStoredLanguage } from '../components/LanguageSwitch';
import PageSkeleton from '../components/PageSkeleton';
import '../styles/globals.css';

const LANGUAGES = ['en', 'de'];
const VIEW_MODES = ['write', 'split', 'preview'];
const LOCAL_BACKUP_PREFIX = 'hosting-wiki-editor-backup:';
const VIEW_MODE_STORAGE_KEY = 'hosting-wiki-editor-view-mode';

const TEXT = {
  en: {
    back: 'Back to wiki',
    loading: 'Loading article...',
    save: 'Save',
    saving: 'Saving...',
    saved: 'Saved.',
    savedWithNewerChanges: 'Saved. Newer changes are still unsaved.',
    unsaved: 'Unsaved changes',
    title: 'Title',
    summary: 'Short description',
    location: 'Folder',
    rootLevel: 'Top level',
    slug: 'URL name',
    write: 'Write',
    preview: 'Preview',
    split: 'Split',
    publishToggle: 'Publish this language',
    published: 'Published',
    draft: 'Draft',
    loadFailed: 'The article could not be loaded.',
    saveFailed: 'The article could not be saved.',
    uploadFailed: 'The image could not be uploaded.',
    titleRequired: 'Enter a title in at least one language.',
    uploading: 'Uploading...',
    imageHint: 'Write in Markdown. Type / for blocks, paste or drop screenshots, and use Ctrl/Cmd + S to save.',
    noImageAtCaret: 'Place the cursor on an image first, then choose an alignment.',
    leaveConfirm: 'You have unsaved changes. Leave anyway?',
    localBackup: 'Local backup',
    localBackupReady: 'A newer local draft was found from an earlier editing session.',
    restore: 'Restore draft',
    discard: 'Discard',
    words: 'words',
    characters: 'characters',
    shortcuts: 'Ctrl/Cmd + S save · Tab indent · / commands',
    slashTitle: 'Insert block',
    dropImage: 'Drop image to upload',
    tools: {
      h1: 'Heading 1', h2: 'Heading 2', h3: 'Heading 3',
      bold: 'Bold', italic: 'Italic', strike: 'Strikethrough',
      code: 'Inline code', codeblock: 'Code block', quote: 'Quote',
      ul: 'Bullet list', ol: 'Numbered list', link: 'Link',
      image: 'Insert image', table: 'Table', hr: 'Divider',
      alignLeft: 'Align image left', alignCenter: 'Center image',
      alignRight: 'Align image right', alignNone: 'Remove image alignment'
    }
  },
  de: {
    back: 'Zurück zum Wiki',
    loading: 'Artikel wird geladen...',
    save: 'Speichern',
    saving: 'Speichert...',
    saved: 'Gespeichert.',
    savedWithNewerChanges: 'Gespeichert. Neuere Änderungen sind noch ungespeichert.',
    unsaved: 'Ungespeicherte Änderungen',
    title: 'Titel',
    summary: 'Kurzbeschreibung',
    location: 'Ordner',
    rootLevel: 'Oberste Ebene',
    slug: 'URL-Name',
    write: 'Schreiben',
    preview: 'Vorschau',
    split: 'Geteilt',
    publishToggle: 'Diese Sprache veröffentlichen',
    published: 'Veröffentlicht',
    draft: 'Entwurf',
    loadFailed: 'Der Artikel konnte nicht geladen werden.',
    saveFailed: 'Der Artikel konnte nicht gespeichert werden.',
    uploadFailed: 'Das Bild konnte nicht hochgeladen werden.',
    titleRequired: 'Gib in mindestens einer Sprache einen Titel ein.',
    uploading: 'Lädt hoch...',
    imageHint: 'Schreibe in Markdown. Mit / Blöcke einfügen, Screenshots einfügen oder hineinziehen und mit Strg/Cmd + S speichern.',
    noImageAtCaret: 'Setze den Cursor zuerst auf ein Bild und wähle dann eine Ausrichtung.',
    leaveConfirm: 'Es gibt ungespeicherte Änderungen. Trotzdem verlassen?',
    localBackup: 'Lokale Sicherung',
    localBackupReady: 'Aus einer früheren Bearbeitung wurde ein neuerer lokaler Entwurf gefunden.',
    restore: 'Entwurf wiederherstellen',
    discard: 'Verwerfen',
    words: 'Wörter',
    characters: 'Zeichen',
    shortcuts: 'Strg/Cmd + S speichern · Tab einrücken · / Befehle',
    slashTitle: 'Block einfügen',
    dropImage: 'Bild zum Hochladen ablegen',
    tools: {
      h1: 'Überschrift 1', h2: 'Überschrift 2', h3: 'Überschrift 3',
      bold: 'Fett', italic: 'Kursiv', strike: 'Durchgestrichen',
      code: 'Code inline', codeblock: 'Codeblock', quote: 'Zitat',
      ul: 'Aufzählung', ol: 'Nummerierte Liste', link: 'Link',
      image: 'Bild einfügen', table: 'Tabelle', hr: 'Trennlinie',
      alignLeft: 'Bild linksbündig', alignCenter: 'Bild zentrieren',
      alignRight: 'Bild rechtsbündig', alignNone: 'Ausrichtung entfernen'
    }
  }
};

const emptyTranslation = () => ({ title: '', summary: '', body: '', isPublished: false });

function buildDraft(article) {
  const translations = {};
  for (const language of LANGUAGES) {
    const existing = (article?.translations || []).find(item => item.language === language);
    translations[language] = existing
      ? {
        title: existing.title || '',
        summary: existing.summary || '',
        body: existing.body || '',
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

function folderOptions(folders, language) {
  const byParent = new Map();
  for (const folder of folders) {
    const key = folder.parent_id || 0;
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key).push(folder);
  }
  const titleOf = (folder) => {
    const list = folder.translations || [];
    const match = list.find(item => item.language === language) || list.find(item => item.language === 'en') || list[0];
    return match?.title || folder.slug;
  };
  const output = [];
  const walk = (parentId, depth) => {
    for (const folder of (byParent.get(parentId) || []).sort((a, b) => a.position - b.position)) {
      output.push({ id: folder.id, label: `${'- '.repeat(depth)}${titleOf(folder)}` });
      walk(folder.id, depth + 1);
    }
  };
  walk(0, 0);
  return output;
}

/**
 * Toolbar actions. `wrap` surrounds the selection, `prefix` is applied to
 * selected lines, and `block` replaces the selection with a block template.
 */
const TOOLS = [
  { key: 'h1', label: 'H1', prefix: '# ', kind: 'prefix', group: 'heading', shortcut: 'alt+1' },
  { key: 'h2', label: 'H2', prefix: '## ', kind: 'prefix', group: 'heading', shortcut: 'alt+2' },
  { key: 'h3', label: 'H3', prefix: '### ', kind: 'prefix', group: 'heading', shortcut: 'alt+3' },
  { key: 'bold', label: 'B', wrap: '**', kind: 'wrap', group: 'inline', shortcut: 'b', style: { fontWeight: 700 } },
  { key: 'italic', label: 'I', wrap: '*', kind: 'wrap', group: 'inline', style: { fontStyle: 'italic' }, shortcut: 'i' },
  { key: 'strike', label: 'S', wrap: '~~', kind: 'wrap', group: 'inline', shortcut: 'shift+x', style: { textDecoration: 'line-through' } },
  { key: 'code', label: '</>', wrap: '`', kind: 'wrap', group: 'inline' },
  { key: 'ul', label: '• List', prefix: '- ', kind: 'prefix', group: 'block', shortcut: 'shift+8' },
  { key: 'ol', label: '1. List', prefix: '1. ', kind: 'prefix', group: 'block', ordered: true, shortcut: 'shift+7' },
  { key: 'quote', label: '❝', prefix: '> ', kind: 'prefix', group: 'block' },
  { key: 'codeblock', label: 'Code', kind: 'block', blockLevel: true, template: '```\n$SELECTION\n```', group: 'block' },
  { key: 'link', label: '🔗', kind: 'block', template: '[$SELECTION](https://)', group: 'block', shortcut: 'k' },
  { key: 'table', label: 'Table', kind: 'block', blockLevel: true, template: '| A | B |\n| --- | --- |\n| 1 | 2 |', group: 'block' },
  { key: 'hr', label: '-', kind: 'block', blockLevel: true, template: '\n---\n', group: 'block' }
];

const SLASH_TOOL_KEYS = ['h1', 'h2', 'h3', 'ul', 'ol', 'quote', 'codeblock', 'table', 'hr', 'image'];

function countWords(value) {
  const trimmed = String(value || '').trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).filter(Boolean).length;
}

function isInsideFence(value, caret) {
  const before = String(value || '').slice(0, caret);
  const fences = before.match(/^\s*```/gm) || [];
  return fences.length % 2 === 1;
}

function getTextareaCaretCoordinates(textarea, position) {
  if (!textarea || typeof window === 'undefined') return null;
  const style = window.getComputedStyle(textarea);
  const rect = textarea.getBoundingClientRect();
  const mirror = document.createElement('div');
  const properties = [
    'boxSizing', 'width', 'height', 'overflowX', 'overflowY',
    'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
    'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
    'fontStyle', 'fontVariant', 'fontWeight', 'fontStretch', 'fontSize', 'fontFamily',
    'lineHeight', 'letterSpacing', 'textTransform', 'textAlign', 'textIndent',
    'textDecoration', 'tabSize', 'MozTabSize'
  ];

  mirror.style.position = 'fixed';
  mirror.style.left = '-9999px';
  mirror.style.top = '0';
  mirror.style.visibility = 'hidden';
  mirror.style.whiteSpace = 'pre-wrap';
  mirror.style.wordWrap = 'break-word';
  mirror.style.overflow = 'hidden';
  properties.forEach(prop => { mirror.style[prop] = style[prop]; });

  mirror.textContent = textarea.value.substring(0, position);
  const marker = document.createElement('span');
  marker.textContent = textarea.value.substring(position) || '.';
  mirror.appendChild(marker);
  document.body.appendChild(mirror);

  const lineHeight = Number.parseFloat(style.lineHeight) || Number.parseFloat(style.fontSize) * 1.5 || 24;
  const result = {
    left: rect.left + marker.offsetLeft - textarea.scrollLeft,
    top: rect.top + marker.offsetTop - textarea.scrollTop + lineHeight
  };
  mirror.remove();
  return result;
}

export default function WikiEditorPage() {
  const { articleId } = useParams();
  const navigate = useNavigate();
  const uiLanguage = readStoredLanguage() === 'de' ? 'de' : 'en';
  const text = TEXT[uiLanguage];

  const [draft, setDraft] = useState(null);
  const [folders, setFolders] = useState([]);
  const [editorLanguage, setEditorLanguage] = useState('en');
  const [viewMode, setViewMode] = useState(() => {
    if (typeof window === 'undefined') return 'write';
    const stored = window.localStorage.getItem(VIEW_MODE_STORAGE_KEY);
    return VIEW_MODES.includes(stored) ? stored : 'write';
  });
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [recovery, setRecovery] = useState(null);
  const [draggingImage, setDraggingImage] = useState(false);
  const [slashMenu, setSlashMenu] = useState({ open: false, start: 0, query: '', selected: 0, coords: null });

  const bodyRef = useRef(null);
  const previewRef = useRef(null);
  const fileInputRef = useRef(null);
  const noticeTimerRef = useRef(null);
  const backupTimerRef = useRef(null);
  const dragDepthRef = useRef(0);
  const changeVersionRef = useRef(0);
  const saveInFlightRef = useRef(false);
  const uploadCounterRef = useRef(0);
  const uploadInFlightRef = useRef(false);

  const backupKey = `${LOCAL_BACKUP_PREFIX}${articleId}`;

  useEffect(() => {
    document.body.classList.add('wiki-editor-route-active');
    return () => document.body.classList.remove('wiki-editor-route-active');
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [articleRes, contentRes] = await Promise.all([
          wikiApi.getArticleForEdit(articleId),
          wikiApi.getAdminContent()
        ]);
        if (cancelled) return;
        const serverDraft = buildDraft(articleRes.data);
        setDraft(serverDraft);
        setFolders(contentRes.data?.folders || []);

        try {
          const raw = window.localStorage.getItem(backupKey);
          if (raw) {
            const stored = JSON.parse(raw);
            if (stored?.draft?.id === serverDraft.id && JSON.stringify(stored.draft) !== JSON.stringify(serverDraft)) {
              setRecovery(stored);
            }
          }
        } catch (_) {
          window.localStorage.removeItem(backupKey);
        }
      } catch (err) {
        if (!cancelled) setError(getErrorMessage(err, text.loadFailed));
      }
    })();
    return () => { cancelled = true; };
  }, [articleId, backupKey, text.loadFailed]);

  useEffect(() => {
    return () => {
      if (noticeTimerRef.current) window.clearTimeout(noticeTimerRef.current);
      if (backupTimerRef.current) window.clearTimeout(backupTimerRef.current);
    };
  }, []);

  // Warn before a reload/tab close swallows unsaved work.
  useEffect(() => {
    const handler = (event) => {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  // Keep a crash-safe local snapshot without silently publishing to the server.
  useEffect(() => {
    if (!dirty || !draft) return undefined;
    if (backupTimerRef.current) window.clearTimeout(backupTimerRef.current);
    backupTimerRef.current = window.setTimeout(() => {
      try {
        window.localStorage.setItem(backupKey, JSON.stringify({
          draft,
          editorLanguage,
          savedAt: Date.now()
        }));
      } catch (_) {
        // Local storage can be unavailable in private/restricted browser modes.
      }
    }, 500);
    return () => {
      if (backupTimerRef.current) window.clearTimeout(backupTimerRef.current);
    };
  }, [dirty, draft, editorLanguage, backupKey]);

  useEffect(() => {
    try { window.localStorage.setItem(VIEW_MODE_STORAGE_KEY, viewMode); } catch (_) { /* ignore */ }
  }, [viewMode]);

  const options = useMemo(() => folderOptions(folders, uiLanguage), [folders, uiLanguage]);
  const translation = draft?.translations?.[editorLanguage];
  const body = translation?.body || '';
  const wordCount = useMemo(() => countWords(body), [body]);
  const characterCount = body.length;

  const slashCommands = useMemo(() => {
    return SLASH_TOOL_KEYS.map((key) => {
      if (key === 'image') {
        return { key, label: text.tools.image, glyph: '▧', keywords: 'image picture screenshot bild foto' };
      }
      const tool = TOOLS.find(item => item.key === key);
      return {
        key,
        label: text.tools[key] || tool?.label || key,
        glyph: tool?.label || key,
        tool,
        keywords: `${key} ${text.tools[key] || ''}`.toLowerCase()
      };
    });
  }, [text.tools]);

  const filteredSlashCommands = useMemo(() => {
    const query = slashMenu.query.trim().toLowerCase();
    if (!query) return slashCommands;
    return slashCommands.filter(command => `${command.label} ${command.keywords}`.toLowerCase().includes(query));
  }, [slashCommands, slashMenu.query]);

  const flash = useCallback((message) => {
    setNotice(message);
    if (noticeTimerRef.current) window.clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = window.setTimeout(() => setNotice(''), 2500);
  }, []);

  const markChanged = useCallback(() => {
    changeVersionRef.current += 1;
    setDirty(true);
  }, []);

  const patchTranslation = useCallback((patch, language = editorLanguage) => {
    setDraft(current => {
      if (!current) return current;
      return {
        ...current,
        translations: {
          ...current.translations,
          [language]: { ...current.translations[language], ...patch }
        }
      };
    });
    markChanged();
  }, [editorLanguage, markChanged]);

  const patchBodyFunctional = useCallback((language, updater) => {
    setDraft(current => {
      if (!current) return current;
      const currentTranslation = current.translations[language] || emptyTranslation();
      return {
        ...current,
        translations: {
          ...current.translations,
          [language]: {
            ...currentTranslation,
            body: updater(currentTranslation.body || '')
          }
        }
      };
    });
    markChanged();
  }, [markChanged]);

  const save = useCallback(async () => {
    if (!draft || saveInFlightRef.current || uploadInFlightRef.current) return;
    if (!LANGUAGES.some(lang => String(draft.translations[lang]?.title || '').trim())) {
      setError(text.titleRequired);
      return;
    }

    const versionAtStart = changeVersionRef.current;
    const payload = {
      folderId: draft.folderId,
      slug: draft.slug || undefined,
      translations: draft.translations
    };

    saveInFlightRef.current = true;
    setBusy('save');
    try {
      await wikiApi.updateArticle(draft.id, payload);
      const hasNewerChanges = changeVersionRef.current !== versionAtStart;
      if (!hasNewerChanges) {
        setDirty(false);
        try { window.localStorage.removeItem(backupKey); } catch (_) { /* ignore */ }
      }
      setError('');
      flash(hasNewerChanges ? text.savedWithNewerChanges : text.saved);
    } catch (err) {
      setError(getErrorMessage(err, text.saveFailed));
    } finally {
      saveInFlightRef.current = false;
      setBusy('');
    }
  }, [draft, backupKey, flash, text.saved, text.savedWithNewerChanges, text.saveFailed, text.titleRequired]);

  const leave = () => {
    if (dirty && !window.confirm(text.leaveConfirm)) return;
    navigate('/admin?tab=wiki');
  };

  const restoreRecovery = () => {
    if (!recovery?.draft) return;
    setDraft(recovery.draft);
    if (LANGUAGES.includes(recovery.editorLanguage)) setEditorLanguage(recovery.editorLanguage);
    changeVersionRef.current += 1;
    setDirty(true);
    setRecovery(null);
  };

  const discardRecovery = () => {
    try { window.localStorage.removeItem(backupKey); } catch (_) { /* ignore */ }
    setRecovery(null);
  };

  const replaceRange = useCallback((start, end, replacement, selectionStart, selectionEnd) => {
    const field = bodyRef.current;
    const value = translation?.body || '';
    const nextValue = value.slice(0, start) + replacement + value.slice(end);
    patchTranslation({ body: nextValue });
    requestAnimationFrame(() => {
      if (!field) return;
      field.focus();
      const fallback = start + replacement.length;
      field.setSelectionRange(selectionStart ?? fallback, selectionEnd ?? selectionStart ?? fallback);
    });
  }, [translation, patchTranslation]);

  const applyToSelection = useCallback((tool) => {
    const field = bodyRef.current;
    if (!field || !translation) return;

    const value = translation.body || '';
    const start = field.selectionStart ?? value.length;
    const end = field.selectionEnd ?? value.length;
    const selected = value.slice(start, end);

    let insert = '';
    let caretStart = start;
    let caretEnd = end;

    if (tool.kind === 'wrap') {
      insert = `${tool.wrap}${selected || ''}${tool.wrap}`;
      caretStart = start + tool.wrap.length;
      caretEnd = caretStart + selected.length;
    } else if (tool.kind === 'prefix') {
      const lineStart = value.lastIndexOf('\n', start - 1) + 1;
      const lineEnd = end === start ? (value.indexOf('\n', start) === -1 ? value.length : value.indexOf('\n', start)) : end;
      const block = value.slice(lineStart, lineEnd);
      const lines = block.split('\n');
      const already = lines.every(line => line.startsWith(tool.prefix) || (tool.ordered && /^\d+\.\s/.test(line)));
      const next = lines.map((line, i) => {
        const clean = line.replace(/^(#{1,6}\s|[-*+]\s|\d+\.\s|>\s)/, '');
        if (already) return clean;
        return tool.ordered ? `${i + 1}. ${clean}` : `${tool.prefix}${clean}`;
      }).join('\n');
      const nextValue = value.slice(0, lineStart) + next + value.slice(lineEnd);
      patchTranslation({ body: nextValue });
      requestAnimationFrame(() => {
        field.focus();
        field.setSelectionRange(lineStart, lineStart + next.length);
      });
      setSlashMenu(menu => ({ ...menu, open: false }));
      return;
    } else if (tool.kind === 'block') {
      const selectionForTemplate = tool.key === 'link' && !selected ? 'link text' : selected;
      insert = tool.template.replace('$SELECTION', selectionForTemplate);
      let lead = '';
      if (tool.blockLevel && start > 0 && value[start - 1] !== '\n') lead = '\n';
      let trail = '';
      if (tool.blockLevel && end < value.length && value[end] !== '\n') trail = '\n';
      insert = lead + insert + trail;
      caretStart = start + insert.length;
      caretEnd = caretStart;

      if (tool.key === 'link') {
        const urlStart = insert.indexOf('](') + 2;
        caretStart = start + urlStart;
        caretEnd = caretStart + 'https://'.length;
      } else if (tool.key === 'codeblock') {
        const innerStart = insert.indexOf('\n') + 1;
        caretStart = start + innerStart;
        caretEnd = caretStart + selected.length;
      } else if (tool.key === 'table') {
        const firstCell = insert.indexOf('A');
        caretStart = start + firstCell;
        caretEnd = caretStart + 1;
      }
    }

    const nextValue = value.slice(0, start) + insert + value.slice(end);
    patchTranslation({ body: nextValue });
    setSlashMenu(menu => ({ ...menu, open: false }));
    requestAnimationFrame(() => {
      field.focus();
      field.setSelectionRange(caretStart, caretEnd);
    });
  }, [translation, patchTranslation]);

  const indentSelection = useCallback((outdent = false) => {
    const field = bodyRef.current;
    if (!field || !translation) return;
    const value = translation.body || '';
    const start = field.selectionStart ?? 0;
    const end = field.selectionEnd ?? start;
    const lineStart = value.lastIndexOf('\n', start - 1) + 1;
    const lineEndIndex = value.indexOf('\n', end);
    const lineEnd = lineEndIndex === -1 ? value.length : lineEndIndex;
    const block = value.slice(lineStart, lineEnd);
    const lines = block.split('\n');

    const nextLines = lines.map(line => {
      if (outdent) return line.replace(/^( {1,2}|\t)/, '');
      return `  ${line}`;
    });
    const next = nextLines.join('\n');
    const nextValue = value.slice(0, lineStart) + next + value.slice(lineEnd);
    patchTranslation({ body: nextValue });
    requestAnimationFrame(() => {
      field.focus();
      field.setSelectionRange(lineStart, lineStart + next.length);
    });
  }, [translation, patchTranslation]);

  const continueMarkdownBlock = useCallback((event) => {
    if (event.shiftKey) return false;
    const field = bodyRef.current;
    if (!field || !translation) return false;
    const value = translation.body || '';
    const start = field.selectionStart ?? 0;
    const end = field.selectionEnd ?? start;
    if (start !== end || isInsideFence(value, start)) return false;

    const lineStart = value.lastIndexOf('\n', start - 1) + 1;
    const currentLine = value.slice(lineStart, start);

    const patterns = [
      { regex: /^(\s*)([-*+])\s+\[( |x|X)\]\s*(.*)$/, next: (m) => `${m[1]}${m[2]} [ ] `, content: (m) => m[4] },
      { regex: /^(\s*)([-*+])\s+(.*)$/, next: (m) => `${m[1]}${m[2]} `, content: (m) => m[3] },
      { regex: /^(\s*)(\d+)\.\s+(.*)$/, next: (m) => `${m[1]}${Number(m[2]) + 1}. `, content: (m) => m[3] },
      { regex: /^(\s*)>\s?(.*)$/, next: (m) => `${m[1]}> `, content: (m) => m[2] }
    ];

    for (const pattern of patterns) {
      const match = currentLine.match(pattern.regex);
      if (!match) continue;
      event.preventDefault();
      const content = String(pattern.content(match) || '').trim();
      if (!content) {
        const replacement = value.slice(0, lineStart) + value.slice(start);
        patchTranslation({ body: replacement });
        requestAnimationFrame(() => {
          field.focus();
          field.setSelectionRange(lineStart, lineStart);
        });
        return true;
      }

      const insertion = `\n${pattern.next(match)}`;
      replaceRange(start, start, insertion, start + insertion.length, start + insertion.length);
      return true;
    }

    return false;
  }, [translation, patchTranslation, replaceRange]);

  /**
   * Apply alignment to the image markdown at (or nearest before) the caret.
   * Alignment is encoded as a #left/#center/#right fragment on the image URL.
   */
  const alignImage = useCallback((align) => {
    const field = bodyRef.current;
    if (!field || !translation) return;
    const value = translation.body || '';
    const caret = field.selectionStart ?? value.length;

    const pattern = /!\[([^\]]*)\]\(([^)\s]+)\)/g;
    let target = null;
    let match;
    while ((match = pattern.exec(value)) !== null) {
      const start = match.index;
      const end = start + match[0].length;
      if (caret >= start && caret <= end) { target = { start, end, alt: match[1], url: match[2] }; break; }
      if (start < caret) target = { start, end, alt: match[1], url: match[2] };
    }

    if (!target) {
      setError(text.noImageAtCaret);
      return;
    }

    const baseUrl = target.url.replace(/#(left|center|right)$/i, '');
    const nextUrl = align ? `${baseUrl}#${align}` : baseUrl;
    const replacement = `![${target.alt}](${nextUrl})`;
    const nextValue = value.slice(0, target.start) + replacement + value.slice(target.end);

    patchTranslation({ body: nextValue });
    setError('');
    requestAnimationFrame(() => {
      field.focus();
      field.setSelectionRange(target.start, target.start + replacement.length);
    });
  }, [translation, patchTranslation, text.noImageAtCaret]);

  const uploadImage = useCallback(async (file) => {
    if (!file || !String(file.type || '').startsWith('image/') || uploadInFlightRef.current) return;
    uploadInFlightRef.current = true;
    const field = bodyRef.current;
    const languageAtStart = editorLanguage;
    const currentBody = draft?.translations?.[languageAtStart]?.body || '';
    const start = field?.selectionStart ?? currentBody.length;
    const end = field?.selectionEnd ?? start;
    const token = `[[WIKI_IMAGE_UPLOAD_${Date.now()}_${uploadCounterRef.current += 1}]]`;

    // Insert a stable placeholder immediately. The async result replaces this
    // token in the latest draft, so typing while the upload runs is never lost.
    patchBodyFunctional(languageAtStart, value => value.slice(0, start) + token + value.slice(end));
    setBusy('upload');
    try {
      const response = await wikiApi.uploadImage(file);
      const url = response.data?.url;
      if (!url) throw new Error(text.uploadFailed);
      const markdown = `![${file.name || 'image'}](${url})`;
      patchBodyFunctional(languageAtStart, value => value.replace(token, markdown));
      setError('');
      requestAnimationFrame(() => {
        if (editorLanguage !== languageAtStart || !bodyRef.current) return;
        const latest = bodyRef.current.value;
        const index = latest.indexOf(markdown);
        if (index >= 0) {
          bodyRef.current.focus();
          bodyRef.current.setSelectionRange(index + markdown.length, index + markdown.length);
        }
      });
    } catch (err) {
      patchBodyFunctional(languageAtStart, value => value.replace(token, ''));
      setError(getErrorMessage(err, text.uploadFailed));
    } finally {
      uploadInFlightRef.current = false;
      setBusy('');
    }
  }, [draft, editorLanguage, patchBodyFunctional, text.uploadFailed]);

  const handlePaste = (event) => {
    const item = [...(event.clipboardData?.items || [])].find(entry => entry.type.startsWith('image/'));
    const file = item?.getAsFile();
    if (!file) return;
    event.preventDefault();
    uploadImage(file);
  };

  const updateSlashMenu = useCallback((field) => {
    if (!field || viewMode === 'preview') {
      setSlashMenu(menu => ({ ...menu, open: false }));
      return;
    }
    const caret = field.selectionStart ?? 0;
    const value = field.value || '';
    const lineStart = value.lastIndexOf('\n', caret - 1) + 1;
    const beforeCaret = value.slice(lineStart, caret);
    const match = beforeCaret.match(/(?:^|\s)\/([a-zA-Z0-9-]*)$/);
    if (!match || isInsideFence(value, caret)) {
      setSlashMenu(menu => ({ ...menu, open: false }));
      return;
    }

    const start = caret - match[1].length - 1;
    const coords = getTextareaCaretCoordinates(field, caret);
    setSlashMenu(current => ({
      open: true,
      start,
      query: match[1],
      selected: current.open ? current.selected : 0,
      coords
    }));
  }, [viewMode]);

  const runSlashCommand = useCallback((command) => {
    const field = bodyRef.current;
    if (!field || !translation) return;
    const start = slashMenu.start;
    const end = field.selectionStart ?? start;

    if (command.key === 'image') {
      replaceRange(start, end, '', start, start);
      setSlashMenu(menu => ({ ...menu, open: false }));
      window.setTimeout(() => fileInputRef.current?.click(), 0);
      return;
    }

    const tool = command.tool;
    if (!tool) return;
    let snippet = '';
    let selectStart;
    let selectEnd;

    if (tool.kind === 'prefix') {
      snippet = tool.ordered ? '1. ' : tool.prefix;
    } else if (tool.key === 'codeblock') {
      snippet = '```\n\n```';
      selectStart = start + 4;
      selectEnd = selectStart;
    } else if (tool.key === 'table') {
      snippet = '| A | B |\n| --- | --- |\n| 1 | 2 |';
      selectStart = start + 2;
      selectEnd = selectStart + 1;
    } else if (tool.key === 'hr') {
      snippet = '---\n';
    } else {
      snippet = tool.template?.replace('$SELECTION', '') || '';
    }

    replaceRange(start, end, snippet, selectStart ?? start + snippet.length, selectEnd ?? selectStart ?? start + snippet.length);
    setSlashMenu(menu => ({ ...menu, open: false }));
  }, [translation, slashMenu.start, replaceRange]);

  const handleKeyDown = (event) => {
    if (slashMenu.open) {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setSlashMenu(menu => ({ ...menu, selected: filteredSlashCommands.length ? (menu.selected + 1) % filteredSlashCommands.length : 0 }));
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setSlashMenu(menu => ({ ...menu, selected: filteredSlashCommands.length ? (menu.selected - 1 + filteredSlashCommands.length) % filteredSlashCommands.length : 0 }));
        return;
      }
      if (event.key === 'Enter' && filteredSlashCommands.length) {
        event.preventDefault();
        runSlashCommand(filteredSlashCommands[Math.min(slashMenu.selected, filteredSlashCommands.length - 1)]);
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        setSlashMenu(menu => ({ ...menu, open: false }));
        return;
      }
    }

    if (event.key === 'Tab') {
      event.preventDefault();
      indentSelection(event.shiftKey);
      return;
    }

    if (event.key === 'Enter' && continueMarkdownBlock(event)) return;

    if (!(event.ctrlKey || event.metaKey)) return;
    const key = event.key.toLowerCase();
    if (key === 's') { event.preventDefault(); save(); return; }

    if (event.altKey && ['1', '2', '3'].includes(key)) {
      event.preventDefault();
      applyToSelection(TOOLS.find(item => item.key === `h${key}`));
      return;
    }

    if (event.shiftKey && key === '7') {
      event.preventDefault();
      applyToSelection(TOOLS.find(item => item.key === 'ol'));
      return;
    }
    if (event.shiftKey && key === '8') {
      event.preventDefault();
      applyToSelection(TOOLS.find(item => item.key === 'ul'));
      return;
    }
    if (event.shiftKey && key === 'x') {
      event.preventDefault();
      applyToSelection(TOOLS.find(item => item.key === 'strike'));
      return;
    }

    const tool = TOOLS.find(item => item.shortcut === key);
    if (tool) { event.preventDefault(); applyToSelection(tool); }
  };

  const handleEditorChange = (event) => {
    patchTranslation({ body: event.target.value });
    requestAnimationFrame(() => updateSlashMenu(event.target));
  };

  const handleEditorScroll = (event) => {
    if (viewMode !== 'split' || !previewRef.current) return;
    const source = event.currentTarget;
    const target = previewRef.current;
    const sourceMax = Math.max(1, source.scrollHeight - source.clientHeight);
    const targetMax = Math.max(0, target.scrollHeight - target.clientHeight);
    target.scrollTop = (source.scrollTop / sourceMax) * targetMax;
    if (slashMenu.open) updateSlashMenu(source);
  };

  const handleDragEnter = (event) => {
    const hasFiles = [...(event.dataTransfer?.types || [])].includes('Files')
      || [...(event.dataTransfer?.items || [])].some(item => item.kind === 'file');
    if (!hasFiles) return;
    event.preventDefault();
    dragDepthRef.current += 1;
    setDraggingImage(true);
  };

  const handleDragLeave = (event) => {
    if (!draggingImage) return;
    event.preventDefault();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setDraggingImage(false);
  };

  const handleDrop = (event) => {
    const file = [...(event.dataTransfer?.files || [])].find(entry => String(entry.type || '').startsWith('image/'));
    if (!file) return;
    event.preventDefault();
    dragDepthRef.current = 0;
    setDraggingImage(false);
    uploadImage(file);
  };

  if (error && !draft) {
    return (
      <div className="wiki-editor-page">
        <div className="wiki-editor-topbar">
          <Link to="/admin?tab=wiki" className="btn-secondary btn-small">{text.back}</Link>
        </div>
        <div className="alert alert-danger">{error}</div>
      </div>
    );
  }

  if (!draft) {
    return <div className="wiki-editor-page wiki-editor-loading"><PageSkeleton variant="editor" /></div>;
  }

  return (
    <div className="wiki-editor-page">
      <header className="wiki-editor-topbar">
        <div className="wiki-editor-topbar-left">
          <button type="button" className="btn-secondary btn-small wiki-editor-header-action" onClick={leave}>← {text.back}</button>
          <span className="wiki-editor-title">{translation?.title || draft.slug}</span>
          {dirty && <span className="wiki-dirty-flag">{text.unsaved}</span>}
        </div>
        <div className="wiki-editor-topbar-right">
          <div className="wiki-language-tabs" role="tablist">
            {LANGUAGES.map(lang => {
              const entry = draft.translations[lang];
              return (
                <button
                  key={lang}
                  type="button"
                  role="tab"
                  aria-selected={editorLanguage === lang}
                  className={`wiki-language-tab ${editorLanguage === lang ? 'active' : ''}`}
                  onClick={() => { setEditorLanguage(lang); setSlashMenu(menu => ({ ...menu, open: false })); }}
                >
                  {lang.toUpperCase()}
                  <span className={`wiki-language-flag ${entry?.isPublished ? 'published' : 'draft'}`}>
                    {String(entry?.title || '').trim() ? (entry?.isPublished ? text.published : text.draft) : '-'}
                  </span>
                </button>
              );
            })}
          </div>
          <button type="button" className="btn-secondary btn-small wiki-editor-header-action" onClick={save} disabled={busy === 'save' || busy === 'upload'}>
            {busy === 'save' ? text.saving : text.save}
          </button>
        </div>
      </header>

      {error && <div className="alert alert-danger wiki-editor-alert">{error}</div>}
      {notice && <div className="alert alert-success wiki-editor-alert">{notice}</div>}

      {recovery && (
        <div className="wiki-editor-recovery" role="status">
          <div>
            <strong>{text.localBackup}</strong>
            <span>{text.localBackupReady}</span>
          </div>
          <div className="wiki-editor-recovery-actions">
            <button type="button" className="btn-primary btn-small" onClick={restoreRecovery}>{text.restore}</button>
            <button type="button" className="btn-secondary btn-small" onClick={discardRecovery}>{text.discard}</button>
          </div>
        </div>
      )}

      <div className="wiki-editor-metabar">
        <label className="form-group">
          <span>{text.title} ({editorLanguage.toUpperCase()})</span>
          <input type="text" value={translation?.title || ''} onChange={(e) => patchTranslation({ title: e.target.value })} />
        </label>
        <label className="form-group">
          <span>{text.summary}</span>
          <input type="text" value={translation?.summary || ''} onChange={(e) => patchTranslation({ summary: e.target.value })} />
        </label>
        <label className="form-group">
          <span>{text.location}</span>
          <select
            value={draft.folderId || ''}
            onChange={(e) => {
              setDraft(current => ({ ...current, folderId: e.target.value || null }));
              markChanged();
            }}
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
            onChange={(e) => {
              setDraft(current => ({ ...current, slug: e.target.value }));
              markChanged();
            }}
          />
        </label>
        <label className="wiki-publish-toggle">
          <span>{text.publishToggle}</span>
          <span className={`toggle-switch ${translation?.isPublished ? 'is-on' : ''}`}>
            <input
              type="checkbox"
              checked={!!translation?.isPublished}
              onChange={(e) => patchTranslation({ isPublished: e.target.checked })}
              aria-label={text.publishToggle}
            />
            <span className="toggle-knob" aria-hidden="true" />
          </span>
        </label>
      </div>

      <div className="wiki-editor-toolbar-bar">
        <div className="wiki-toolbar-tools">
          {['heading', 'inline', 'block'].map(group => (
            <div className="wiki-toolbar-group" key={group}>
              {TOOLS.filter(tool => tool.group === group).map(tool => (
                <button
                  key={tool.key}
                  type="button"
                  className="wiki-toolbar-btn"
                  style={tool.style}
                  title={text.tools[tool.key]}
                  aria-label={text.tools[tool.key]}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => applyToSelection(tool)}
                  disabled={viewMode === 'preview'}
                >
                  {tool.label}
                </button>
              ))}
            </div>
          ))}
          <div className="wiki-toolbar-group">
            <label
              className={`wiki-toolbar-btn wiki-upload-button ${busy === 'upload' ? 'is-busy' : ''}`}
              title={text.tools.image}
            >
              {busy === 'upload' ? text.uploading : `🖼 ${text.tools.image}`}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml"
                onChange={(e) => { uploadImage(e.target.files?.[0]); e.target.value = ''; }}
                hidden
                disabled={busy === 'upload'}
              />
            </label>
            {[
              ['left', '⇤', text.tools.alignLeft],
              ['center', '↔', text.tools.alignCenter],
              ['right', '⇥', text.tools.alignRight],
              ['', '⦸', text.tools.alignNone]
            ].map(([align, glyph, label]) => (
              <button
                key={align || 'none'}
                type="button"
                className="wiki-toolbar-btn"
                title={label}
                aria-label={label}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => alignImage(align)}
                disabled={viewMode === 'preview'}
              >
                {glyph}
              </button>
            ))}
          </div>
        </div>

        <div className="wiki-toolbar-right">
          <div className="wiki-view-toggle">
            {VIEW_MODES.map(mode => (
              <button
                key={mode}
                type="button"
                className={viewMode === mode ? 'active' : ''}
                onClick={() => { setViewMode(mode); setSlashMenu(menu => ({ ...menu, open: false })); }}
              >
                {text[mode]}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div
        className={`wiki-editor-workspace mode-${viewMode} ${draggingImage ? 'is-dragging-image' : ''}`}
        onDragEnter={handleDragEnter}
        onDragOver={(event) => {
          const hasFiles = [...(event.dataTransfer?.types || [])].includes('Files')
            || [...(event.dataTransfer?.items || [])].some(item => item.kind === 'file');
          if (hasFiles) event.preventDefault();
        }}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {viewMode !== 'preview' && (
          <textarea
            ref={bodyRef}
            className="wiki-body-editor wiki-body-editor-full"
            value={translation?.body || ''}
            onChange={handleEditorChange}
            onPaste={handlePaste}
            onKeyDown={handleKeyDown}
            onKeyUp={(event) => updateSlashMenu(event.currentTarget)}
            onClick={(event) => updateSlashMenu(event.currentTarget)}
            onSelect={(event) => { if (slashMenu.open) updateSlashMenu(event.currentTarget); }}
            onScroll={handleEditorScroll}
            spellCheck
            placeholder={text.imageHint}
          />
        )}
        {viewMode !== 'write' && (
          <div ref={previewRef} className="wiki-preview-pane wiki-preview-pane-full">
            <MarkdownView content={translation?.body || ''} language={uiLanguage} />
          </div>
        )}
        {draggingImage && <div className="wiki-editor-drop-overlay">{text.dropImage}</div>}
      </div>

      <div className="wiki-editor-statusbar">
        <span>{wordCount} {text.words} · {characterCount} {text.characters}</span>
        <span>{text.shortcuts}</span>
      </div>

      {slashMenu.open && (
        <div
          className="wiki-slash-menu"
          style={{
            left: Math.min(slashMenu.coords?.left || 24, Math.max(24, window.innerWidth - 340)),
            top: Math.min(slashMenu.coords?.top || 120, Math.max(80, window.innerHeight - 360))
          }}
          role="listbox"
          aria-label={text.slashTitle}
        >
          <div className="wiki-slash-menu-title">{text.slashTitle}</div>
          {filteredSlashCommands.length ? filteredSlashCommands.map((command, index) => (
            <button
              key={command.key}
              type="button"
              className={index === slashMenu.selected ? 'active' : ''}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => runSlashCommand(command)}
              role="option"
              aria-selected={index === slashMenu.selected}
            >
              <span className="wiki-slash-glyph">{command.glyph}</span>
              <span>{command.label}</span>
            </button>
          )) : (
            <div className="wiki-slash-empty">-</div>
          )}
        </div>
      )}
    </div>
  );
}
