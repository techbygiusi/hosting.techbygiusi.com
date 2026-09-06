import React, { useEffect, useMemo, useState } from 'react';
import { adminApi } from '../services/api';
import ClusterHealthWidget from './ClusterHealthWidget';
import { InlineNotice } from './UiBits';
import { DashboardIcon, ServerIcon, ClockIcon } from './Icons';

const COLS = 8;
const ROWS = 4;
const WIDGET_TYPES = [
  { type: 'cluster', label: 'Cluster health', hint: 'Overall cluster and node state', w: 4, h: 1, icon: DashboardIcon },
  { type: 'cpu', label: 'CPU', hint: 'Current cluster CPU usage', w: 2, h: 1, icon: ServerIcon },
  { type: 'memory', label: 'Memory', hint: 'Current cluster memory usage', w: 2, h: 1, icon: ServerIcon },
  { type: 'storage', label: 'Storage', hint: 'Cluster storage utilization', w: 2, h: 1, icon: ServerIcon },
  { type: 'uptime', label: 'Uptime', hint: 'Shortest online node uptime', w: 2, h: 1, icon: ClockIcon },
  { type: 'nodes', label: 'Nodes', hint: 'Compact node health list', w: 4, h: 2, icon: DashboardIcon },
  { type: 'clock', label: 'Clock', hint: 'Local kiosk time', w: 2, h: 1, icon: ClockIcon }
];

function id() {
  return `health-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function canPlace(widgets, candidate, ignoreId = null) {
  if (candidate.x < 0 || candidate.y < 0 || candidate.x + candidate.w > COLS || candidate.y + candidate.h > ROWS) return false;
  return !widgets.some((item) => item.id !== ignoreId && rectsOverlap(item, candidate));
}

function findFreePosition(widgets, w, h) {
  for (let y = 0; y <= ROWS - h; y += 1) {
    for (let x = 0; x <= COLS - w; x += 1) {
      const candidate = { x, y, w, h };
      if (canPlace(widgets, candidate)) return { x, y };
    }
  }
  return null;
}

function buildStarterLayout(clusterId) {
  if (!clusterId) return [
    { id: id(), type: 'clock', clusterId: null, label: '', x: 6, y: 0, w: 2, h: 1 }
  ];
  return [
    { id: id(), type: 'cluster', clusterId, label: '', x: 0, y: 0, w: 4, h: 1 },
    { id: id(), type: 'clock', clusterId: null, label: '', x: 6, y: 0, w: 2, h: 1 },
    { id: id(), type: 'cpu', clusterId, label: '', x: 0, y: 1, w: 2, h: 1 },
    { id: id(), type: 'memory', clusterId, label: '', x: 2, y: 1, w: 2, h: 1 },
    { id: id(), type: 'storage', clusterId, label: '', x: 4, y: 1, w: 2, h: 1 },
    { id: id(), type: 'uptime', clusterId, label: '', x: 6, y: 1, w: 2, h: 1 },
    { id: id(), type: 'nodes', clusterId, label: '', x: 0, y: 2, w: 8, h: 2 }
  ];
}

export default function ClusterHealthDisplaySettings({ clusters = [], clusterStats = [], language = 'en' }) {
  const de = language === 'de';
  const [config, setConfig] = useState({ enabled: true, title: 'Cluster Health', theme: 'dark', language: 'en', refreshSeconds: 10, columns: COLS, rows: ROWS, width: 800, height: 480, widgets: [] });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedId, setSelectedId] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [dragged, setDragged] = useState(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const response = await adminApi.getClusterHealthDisplay();
        if (!active) return;
        const loaded = response.data?.config || {};
        const widgets = Array.isArray(loaded.widgets) && loaded.widgets.length
          ? loaded.widgets
          : buildStarterLayout(clusters[0]?.id ? Number(clusters[0].id) : null);
        setConfig({ ...loaded, widgets, columns: COLS, rows: ROWS, width: 800, height: 480 });
      } catch (err) {
        if (active) setError(err.response?.data?.message || err.message || 'Display configuration could not be loaded.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [clusters]);

  const selected = config.widgets.find((widget) => widget.id === selectedId) || null;
  const statsById = useMemo(() => new Map(clusterStats.map((item) => [Number(item.id), item])), [clusterStats]);

  const addWidget = (definition, preferredPosition = null) => {
    const clusterId = definition.type === 'clock' ? null : (Number(clusters[0]?.id) || null);
    const position = preferredPosition && canPlace(config.widgets, { ...preferredPosition, w: definition.w, h: definition.h })
      ? preferredPosition
      : findFreePosition(config.widgets, definition.w, definition.h);
    if (!position) {
      setError(de ? 'Im 800×480 Raster ist kein freier Platz für dieses Element.' : 'There is no free space for this element in the 800×480 grid.');
      return;
    }
    const widget = { id: id(), type: definition.type, clusterId, label: '', x: position.x, y: position.y, w: definition.w, h: definition.h };
    setConfig((current) => ({ ...current, widgets: [...current.widgets, widget] }));
    setSelectedId(widget.id);
    setError('');
  };

  const moveWidget = (widgetId, x, y) => {
    setConfig((current) => {
      const widget = current.widgets.find((item) => item.id === widgetId);
      if (!widget) return current;
      const candidate = { ...widget, x: Math.max(0, Math.min(COLS - widget.w, x)), y: Math.max(0, Math.min(ROWS - widget.h, y)) };
      if (!canPlace(current.widgets, candidate, widgetId)) return current;
      return { ...current, widgets: current.widgets.map((item) => item.id === widgetId ? candidate : item) };
    });
  };

  const dropOnGrid = (event) => {
    event.preventDefault();
    if (!dragged) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = Math.max(0, Math.min(COLS - 1, Math.floor(((event.clientX - rect.left) / rect.width) * COLS)));
    const y = Math.max(0, Math.min(ROWS - 1, Math.floor(((event.clientY - rect.top) / rect.height) * ROWS)));
    if (dragged.kind === 'palette') {
      const definition = WIDGET_TYPES.find((item) => item.type === dragged.type);
      if (definition) addWidget(definition, { x: Math.min(x, COLS - definition.w), y: Math.min(y, ROWS - definition.h) });
    } else if (dragged.kind === 'widget') {
      const widget = config.widgets.find((item) => item.id === dragged.id);
      if (widget) moveWidget(widget.id, Math.min(x, COLS - widget.w), Math.min(y, ROWS - widget.h));
    }
    setDragged(null);
  };

  const updateSelected = (patch) => {
    if (!selected) return;
    setConfig((current) => ({ ...current, widgets: current.widgets.map((item) => item.id === selected.id ? { ...item, ...patch } : item) }));
  };

  const changeSize = (value) => {
    if (!selected) return;
    const [w, h] = value.split('x').map(Number);
    const candidate = { ...selected, w, h, x: Math.min(selected.x, COLS - w), y: Math.min(selected.y, ROWS - h) };
    if (!canPlace(config.widgets, candidate, selected.id)) {
      setError(de ? 'Für diese Größe ist an der aktuellen Position nicht genug Platz.' : 'There is not enough free space for this size at the current position.');
      return;
    }
    updateSelected(candidate);
    setError('');
  };

  const removeSelected = () => {
    if (!selected) return;
    setConfig((current) => ({ ...current, widgets: current.widgets.filter((item) => item.id !== selected.id) }));
    setSelectedId('');
  };

  const save = async () => {
    setSaving(true);
    setNotice('');
    setError('');
    try {
      const response = await adminApi.updateClusterHealthDisplay(config);
      setConfig(response.data?.config || config);
      setNotice(de ? 'Cluster-Health-Display gespeichert.' : 'Cluster health display saved.');
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Display configuration could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  const reset = () => {
    setConfig((current) => ({ ...current, widgets: buildStarterLayout(Number(clusters[0]?.id) || null) }));
    setSelectedId('');
  };

  if (loading) return <div className="panel-card cluster-health-builder-loading">{de ? 'Display-Konfiguration wird geladen…' : 'Loading display configuration…'}</div>;

  const displayUrl = `${window.location.origin}/cluster-health`;

  return (
    <div className="cluster-health-builder-page">
      {error ? <InlineNotice tone="danger">{error}</InlineNotice> : null}
      {notice ? <InlineNotice tone="success">{notice}</InlineNotice> : null}

      <section className="cluster-health-builder-shell">
        <div className="cluster-health-builder-settings">
          <div className="cluster-health-builder-settings-main">
            <label>
              <span>{de ? 'Titel' : 'Title'}</span>
              <input value={config.title || ''} onChange={(event) => setConfig((current) => ({ ...current, title: event.target.value }))} />
            </label>
            <label>
              <span>{de ? 'Darstellung' : 'Appearance'}</span>
              <select value={config.theme || 'dark'} onChange={(event) => setConfig((current) => ({ ...current, theme: event.target.value }))}>
                <option value="dark">{de ? 'Dunkel' : 'Dark'}</option>
                <option value="light">{de ? 'Hell' : 'Light'}</option>
              </select>
            </label>
            <label>
              <span>{de ? 'Display-Sprache' : 'Display language'}</span>
              <select value={config.language || 'en'} onChange={(event) => setConfig((current) => ({ ...current, language: event.target.value }))}>
                <option value="en">English</option>
                <option value="de">Deutsch</option>
              </select>
            </label>
            <label>
              <span>{de ? 'Aktualisierung' : 'Refresh'}</span>
              <select value={config.refreshSeconds || 10} onChange={(event) => setConfig((current) => ({ ...current, refreshSeconds: Number(event.target.value) }))}>
                {[5, 10, 15, 30, 60].map((seconds) => <option value={seconds} key={seconds}>{seconds}s</option>)}
              </select>
            </label>
            <label className="cluster-health-builder-enabled">
              <span>{de ? 'Öffentliches Display' : 'Public display'}</span>
              <input type="checkbox" checked={config.enabled !== false} onChange={(event) => setConfig((current) => ({ ...current, enabled: event.target.checked }))} />
            </label>
          </div>
          <div className="cluster-health-builder-url">
            <div><span>{de ? 'Kiosk-URL' : 'Kiosk URL'}</span><strong>{displayUrl}</strong></div>
            <button type="button" className="btn-secondary" onClick={() => navigator.clipboard?.writeText(displayUrl)}>{de ? 'Kopieren' : 'Copy'}</button>
          </div>
        </div>

        <div className="cluster-health-builder-workspace">
          <aside className="cluster-health-widget-palette">
            <div className="cluster-health-builder-section-head">
              <strong>{de ? 'Elemente' : 'Widgets'}</strong>
              <span>{de ? 'Ziehen oder anklicken' : 'Drag or click'}</span>
            </div>
            <div className="cluster-health-palette-list">
              {WIDGET_TYPES.map((definition) => {
                const Icon = definition.icon;
                return (
                  <button
                    type="button"
                    className="cluster-health-palette-item"
                    key={definition.type}
                    draggable
                    onDragStart={() => setDragged({ kind: 'palette', type: definition.type })}
                    onDragEnd={() => setDragged(null)}
                    onClick={() => addWidget(definition)}
                  >
                    <span><Icon size={18} /></span>
                    <div><strong>{definition.label}</strong><small>{definition.hint}</small></div>
                    <em>{definition.w}×{definition.h}</em>
                  </button>
                );
              })}
            </div>
          </aside>

          <div className="cluster-health-canvas-column">
            <div className="cluster-health-canvas-heading">
              <div><strong>800 × 480</strong><span>{de ? '8 × 4 Kachelraster' : '8 × 4 tile grid'}</span></div>
              <button type="button" className="btn-secondary btn-small" onClick={reset}>{de ? 'Standardlayout' : 'Default layout'}</button>
            </div>
            <div
              className={`cluster-health-layout-canvas theme-${config.theme || 'dark'}`}
              onDragOver={(event) => event.preventDefault()}
              onDrop={dropOnGrid}
            >
              <div className="cluster-health-grid-lines" aria-hidden="true" />
              {config.widgets.map((widget) => {
                const cluster = statsById.get(Number(widget.clusterId));
                return (
                  <div
                    key={widget.id}
                    className={`cluster-health-layout-widget ${selectedId === widget.id ? 'selected' : ''}`}
                    style={{ gridColumn: `${widget.x + 1} / span ${widget.w}`, gridRow: `${widget.y + 1} / span ${widget.h}` }}
                    draggable
                    onDragStart={(event) => { event.stopPropagation(); setDragged({ kind: 'widget', id: widget.id }); }}
                    onDragEnd={() => setDragged(null)}
                    onClick={() => setSelectedId(widget.id)}
                  >
                    <ClusterHealthWidget widget={widget} cluster={cluster} preview language={config.language || language} />
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="cluster-health-widget-editor">
          <div className="cluster-health-builder-section-head">
            <strong>{de ? 'Ausgewähltes Element' : 'Selected widget'}</strong>
            <span>{selected ? `${selected.type} · ${selected.w}×${selected.h}` : (de ? 'Klicke ein Element im Raster an.' : 'Select a widget in the grid.')}</span>
          </div>
          {selected ? (
            <div className="cluster-health-widget-editor-grid">
              {selected.type !== 'clock' ? (
                <label><span>Cluster</span><select value={selected.clusterId || ''} onChange={(event) => updateSelected({ clusterId: Number(event.target.value) || null })}><option value="">—</option>{clusters.map((cluster) => <option value={cluster.id} key={cluster.id}>{cluster.name}</option>)}</select></label>
              ) : <div className="cluster-health-widget-editor-spacer" />}
              <label><span>{de ? 'Eigener Titel (optional)' : 'Custom label (optional)'}</span><input value={selected.label || ''} onChange={(event) => updateSelected({ label: event.target.value })} /></label>
              <label><span>{de ? 'Größe' : 'Size'}</span><select value={`${selected.w}x${selected.h}`} onChange={(event) => changeSize(event.target.value)}><option value="2x1">2×1</option><option value="4x1">4×1</option><option value="4x2">4×2</option><option value="8x2">8×2</option></select></label>
              <button type="button" className="btn-danger" onClick={removeSelected}>{de ? 'Element entfernen' : 'Remove widget'}</button>
            </div>
          ) : null}
        </div>

        <div className="cluster-health-builder-actions">
          <span>{de ? 'Die Anzeige nutzt nur aggregierte, schreibgeschützte Cluster-Daten.' : 'The display exposes aggregate, read-only cluster health data only.'}</span>
          <button type="button" className="btn-primary" onClick={save} disabled={saving}>{saving ? (de ? 'Speichert…' : 'Saving…') : (de ? 'Display speichern' : 'Save display')}</button>
        </div>
      </section>
    </div>
  );
}
