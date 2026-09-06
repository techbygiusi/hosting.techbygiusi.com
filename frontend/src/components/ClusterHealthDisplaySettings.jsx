import React, { useEffect, useMemo, useRef, useState } from 'react';
import { adminApi } from '../services/api';
import ClusterHealthWidget from './ClusterHealthWidget';
import { InlineNotice } from './UiBits';
import { DashboardIcon, ServerIcon, ClockIcon, SunIcon, MoonIcon, LinkIcon, GlobeIcon } from './Icons';
import PreferenceSlider from './PreferenceSlider';

const COLS = 8;
const ROWS = 4;
const DRAG_THRESHOLD = 6;

const WIDGET_TYPES = [
  { type: 'cluster', label: 'Cluster health', hint: 'Overall cluster and node state', w: 4, h: 1, icon: DashboardIcon },
  { type: 'logo', label: 'Hosting logo', hint: 'The same logo used on the login page', w: 2, h: 1, icon: DashboardIcon, global: true },
  { type: 'cpu', label: 'CPU', hint: 'Current cluster CPU usage', w: 2, h: 1, icon: ServerIcon },
  { type: 'memory', label: 'Memory', hint: 'Current cluster memory usage', w: 2, h: 1, icon: ServerIcon },
  { type: 'storage', label: 'Storage', hint: 'Cluster storage utilization', w: 2, h: 1, icon: ServerIcon },
  { type: 'uptime', label: 'Uptime', hint: 'Shortest online node uptime', w: 2, h: 1, icon: ClockIcon },
  { type: 'nodes', label: 'Nodes', hint: 'Compact node health list', w: 4, h: 2, icon: DashboardIcon },
  { type: 'pangolin', label: 'Pangolin', hint: 'Pangolin API and publishing status', w: 2, h: 1, icon: LinkIcon },
  { type: 'services', label: 'Portal services', hint: 'Services assigned to this cluster', w: 2, h: 1, icon: ServerIcon },
  { type: 'location', label: 'Location', hint: 'Configured cluster location', w: 2, h: 1, icon: GlobeIcon },
  { type: 'clock', label: 'Clock', hint: 'Local kiosk time', w: 2, h: 1, icon: ClockIcon, global: true }
];

const GLOBAL_TYPES = new Set(WIDGET_TYPES.filter((item) => item.global).map((item) => item.type));

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

function clampPosition(value, max) {
  return Math.max(0, Math.min(max, Number(value) || 0));
}

function findNearestPosition(widgets, w, h, targetX = 0, targetY = 0, ignoreId = null) {
  const tx = clampPosition(targetX, COLS - w);
  const ty = clampPosition(targetY, ROWS - h);
  const candidates = [];
  for (let y = 0; y <= ROWS - h; y += 1) {
    for (let x = 0; x <= COLS - w; x += 1) {
      const candidate = { x, y, w, h };
      if (!canPlace(widgets, candidate, ignoreId)) continue;
      const distance = ((x - tx) ** 2) + ((y - ty) ** 2);
      candidates.push({ x, y, distance });
    }
  }
  candidates.sort((a, b) => a.distance - b.distance || a.y - b.y || a.x - b.x);
  return candidates[0] ? { x: candidates[0].x, y: candidates[0].y } : null;
}

function findFreePosition(widgets, w, h) {
  return findNearestPosition(widgets, w, h, 0, 0);
}

function buildStarterLayout(clusterId) {
  if (!clusterId) return [
    { id: id(), type: 'logo', clusterId: null, label: '', x: 0, y: 0, w: 2, h: 1 },
    { id: id(), type: 'clock', clusterId: null, label: '', x: 6, y: 0, w: 2, h: 1 }
  ];
  return [
    { id: id(), type: 'cluster', clusterId, label: '', x: 0, y: 0, w: 4, h: 1 },
    { id: id(), type: 'logo', clusterId: null, label: '', x: 4, y: 0, w: 2, h: 1 },
    { id: id(), type: 'clock', clusterId: null, label: '', x: 6, y: 0, w: 2, h: 1 },
    { id: id(), type: 'cpu', clusterId, label: '', x: 0, y: 1, w: 2, h: 1 },
    { id: id(), type: 'memory', clusterId, label: '', x: 2, y: 1, w: 2, h: 1 },
    { id: id(), type: 'storage', clusterId, label: '', x: 4, y: 1, w: 2, h: 1 },
    { id: id(), type: 'uptime', clusterId, label: '', x: 6, y: 1, w: 2, h: 1 },
    { id: id(), type: 'nodes', clusterId, label: '', x: 0, y: 2, w: 8, h: 2 }
  ];
}

function definitionFor(type) {
  return WIDGET_TYPES.find((item) => item.type === type) || null;
}

function widgetNeedsCluster(type) {
  return !GLOBAL_TYPES.has(type);
}

export default function ClusterHealthDisplaySettings({ clusters = [], clusterStats = [], language = 'en' }) {
  const de = language === 'de';
  const canvasRef = useRef(null);
  const pointerRef = useRef(null);
  const [config, setConfig] = useState({ enabled: true, title: 'Cluster Health', theme: 'dark', language: 'en', refreshSeconds: 10, columns: COLS, rows: ROWS, width: 800, height: 480, widgets: [] });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedId, setSelectedId] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [dragPreview, setDragPreview] = useState(null);
  const [activeDragId, setActiveDragId] = useState('');

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
    const clusterId = definition.global ? null : (Number(clusters[0]?.id) || null);
    const position = preferredPosition
      ? findNearestPosition(config.widgets, definition.w, definition.h, preferredPosition.x, preferredPosition.y)
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
      const position = findNearestPosition(current.widgets, widget.w, widget.h, x, y, widgetId);
      if (!position || (position.x === widget.x && position.y === widget.y)) return current;
      return {
        ...current,
        widgets: current.widgets.map((item) => item.id === widgetId ? { ...item, x: position.x, y: position.y } : item)
      };
    });
  };

  const gridTarget = (clientX, clientY, w, h, offsetX = 0, offsetY = 0) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const inside = clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
    if (!inside) return null;
    const cellX = Math.floor(((clientX - rect.left) / rect.width) * COLS);
    const cellY = Math.floor(((clientY - rect.top) / rect.height) * ROWS);
    return {
      x: clampPosition(cellX - offsetX, COLS - w),
      y: clampPosition(cellY - offsetY, ROWS - h)
    };
  };

  const startPalettePointer = (event, definition) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    pointerRef.current = {
      kind: 'palette',
      pointerId: event.pointerId,
      definition,
      startX: event.clientX,
      startY: event.clientY,
      dragging: false
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const movePalettePointer = (event) => {
    const drag = pointerRef.current;
    if (!drag || drag.kind !== 'palette' || drag.pointerId !== event.pointerId) return;
    const distance = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY);
    if (!drag.dragging && distance < DRAG_THRESHOLD) return;
    drag.dragging = true;
    event.preventDefault();
    const target = gridTarget(event.clientX, event.clientY, drag.definition.w, drag.definition.h);
    if (!target) {
      setDragPreview(null);
      return;
    }
    const position = findNearestPosition(config.widgets, drag.definition.w, drag.definition.h, target.x, target.y);
    drag.preview = position ? { ...position, w: drag.definition.w, h: drag.definition.h, type: drag.definition.type } : null;
    setDragPreview(drag.preview);
  };

  const endPalettePointer = (event) => {
    const drag = pointerRef.current;
    if (!drag || drag.kind !== 'palette' || drag.pointerId !== event.pointerId) return;
    if (drag.dragging) {
      if (drag.preview) addWidget(drag.definition, drag.preview);
    } else {
      addWidget(drag.definition);
    }
    pointerRef.current = null;
    setDragPreview(null);
  };

  const cancelPalettePointer = (event) => {
    if (pointerRef.current?.kind === 'palette' && pointerRef.current.pointerId === event.pointerId) {
      pointerRef.current = null;
      setDragPreview(null);
    }
  };

  const startWidgetPointer = (event, widget) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const offsetX = clampPosition(Math.floor(((event.clientX - rect.left) / Math.max(1, rect.width)) * widget.w), widget.w - 1);
    const offsetY = clampPosition(Math.floor(((event.clientY - rect.top) / Math.max(1, rect.height)) * widget.h), widget.h - 1);
    pointerRef.current = {
      kind: 'widget',
      pointerId: event.pointerId,
      widgetId: widget.id,
      startX: event.clientX,
      startY: event.clientY,
      offsetX,
      offsetY,
      originalX: widget.x,
      originalY: widget.y,
      dragging: false
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const moveWidgetPointer = (event) => {
    const drag = pointerRef.current;
    if (!drag || drag.kind !== 'widget' || drag.pointerId !== event.pointerId) return;
    const distance = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY);
    if (!drag.dragging && distance < DRAG_THRESHOLD) return;
    drag.dragging = true;
    event.preventDefault();
    setSelectedId(drag.widgetId);
    setActiveDragId(drag.widgetId);
    const widget = config.widgets.find((item) => item.id === drag.widgetId);
    if (!widget) return;
    const target = gridTarget(event.clientX, event.clientY, widget.w, widget.h, drag.offsetX, drag.offsetY);
    if (target) moveWidget(widget.id, target.x, target.y);
  };

  const endWidgetPointer = (event) => {
    const drag = pointerRef.current;
    if (!drag || drag.kind !== 'widget' || drag.pointerId !== event.pointerId) return;
    if (!drag.dragging) setSelectedId(drag.widgetId);
    pointerRef.current = null;
    setActiveDragId('');
  };

  const cancelWidgetPointer = (event) => {
    const drag = pointerRef.current;
    if (!drag || drag.kind !== 'widget' || drag.pointerId !== event.pointerId) return;
    if (drag.dragging) {
      setConfig((current) => ({
        ...current,
        widgets: current.widgets.map((item) => item.id === drag.widgetId ? { ...item, x: drag.originalX, y: drag.originalY } : item)
      }));
    }
    pointerRef.current = null;
    setActiveDragId('');
  };

  const updateSelected = (patch) => {
    if (!selected) return;
    setConfig((current) => ({ ...current, widgets: current.widgets.map((item) => item.id === selected.id ? { ...item, ...patch } : item) }));
  };

  const changeSize = (value) => {
    if (!selected) return;
    const [w, h] = value.split('x').map(Number);
    const position = findNearestPosition(config.widgets, w, h, Math.min(selected.x, COLS - w), Math.min(selected.y, ROWS - h), selected.id);
    if (!position) {
      setError(de ? 'Für diese Größe ist im Raster nicht genug freier Platz.' : 'There is not enough free space in the grid for this size.');
      return;
    }
    updateSelected({ w, h, x: position.x, y: position.y });
    setError('');
  };

  const nudgeSelected = (event, widget) => {
    const directions = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1]
    };
    const direction = directions[event.key];
    if (!direction) return;
    event.preventDefault();
    setSelectedId(widget.id);
    moveWidget(widget.id, widget.x + direction[0], widget.y + direction[1]);
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
    setDragPreview(null);
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
            <label className="cluster-health-theme-setting">
              <span>{de ? 'Dashboard-Design' : 'Dashboard theme'}</span>
              <PreferenceSlider
                value={config.theme || 'dark'}
                onChange={(theme) => setConfig((current) => ({ ...current, theme }))}
                ariaLabel={de ? 'Dashboard-Design' : 'Dashboard theme'}
                options={[
                  { value: 'light', label: de ? 'Hell' : 'Light', icon: SunIcon },
                  { value: 'dark', label: de ? 'Dunkel' : 'Dark', icon: MoonIcon }
                ]}
              />
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
              <span>{de ? 'Klicken oder per Maus/Touch ins Raster ziehen' : 'Click or drag into the grid with mouse/touch'}</span>
            </div>
            <div className="cluster-health-palette-list">
              {WIDGET_TYPES.map((definition) => {
                const Icon = definition.icon;
                return (
                  <button
                    type="button"
                    className="cluster-health-palette-item"
                    key={definition.type}
                    onPointerDown={(event) => startPalettePointer(event, definition)}
                    onPointerMove={movePalettePointer}
                    onPointerUp={endPalettePointer}
                    onPointerCancel={cancelPalettePointer}
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
              <div><strong>800 × 480</strong><span>{de ? '8 × 4 Kachelraster · Widgets rasten automatisch ein' : '8 × 4 tile grid · widgets snap automatically'}</span></div>
              <button type="button" className="btn-secondary btn-small" onClick={reset}>{de ? 'Standardlayout' : 'Default layout'}</button>
            </div>
            <div ref={canvasRef} className={`cluster-health-layout-canvas theme-${config.theme || 'dark'}`}>
              <div className="cluster-health-grid-lines" aria-hidden="true" />
              {dragPreview ? (
                <div
                  className="cluster-health-drop-preview"
                  style={{ gridColumn: `${dragPreview.x + 1} / span ${dragPreview.w}`, gridRow: `${dragPreview.y + 1} / span ${dragPreview.h}` }}
                  aria-hidden="true"
                />
              ) : null}
              {config.widgets.map((widget) => {
                const cluster = statsById.get(Number(widget.clusterId));
                return (
                  <div
                    key={widget.id}
                    className={`cluster-health-layout-widget ${selectedId === widget.id ? 'selected' : ''} ${activeDragId === widget.id ? 'dragging' : ''}`}
                    style={{ gridColumn: `${widget.x + 1} / span ${widget.w}`, gridRow: `${widget.y + 1} / span ${widget.h}` }}
                    tabIndex="0"
                    role="button"
                    aria-label={`${definitionFor(widget.type)?.label || widget.type} ${widget.w} by ${widget.h}`}
                    onPointerDown={(event) => startWidgetPointer(event, widget)}
                    onPointerMove={moveWidgetPointer}
                    onPointerUp={endWidgetPointer}
                    onPointerCancel={cancelWidgetPointer}
                    onKeyDown={(event) => nudgeSelected(event, widget)}
                    onFocus={() => setSelectedId(widget.id)}
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
              {widgetNeedsCluster(selected.type) ? (
                <label><span>Cluster</span><select value={selected.clusterId || ''} onChange={(event) => updateSelected({ clusterId: Number(event.target.value) || null })}><option value="">—</option>{clusters.map((cluster) => <option value={cluster.id} key={cluster.id}>{cluster.name}</option>)}</select></label>
              ) : <div className="cluster-health-widget-editor-spacer" />}
              <label><span>{de ? 'Eigener Titel (optional)' : 'Custom label (optional)'}</span><input value={selected.label || ''} onChange={(event) => updateSelected({ label: event.target.value })} /></label>
              <label><span>{de ? 'Größe' : 'Size'}</span><select value={`${selected.w}x${selected.h}`} onChange={(event) => changeSize(event.target.value)}><option value="2x1">2×1</option><option value="4x1">4×1</option><option value="8x1">8×1</option><option value="2x2">2×2</option><option value="4x2">4×2</option><option value="8x2">8×2</option></select></label>
              <button type="button" className="btn-danger" onClick={removeSelected}>{de ? 'Element entfernen' : 'Remove widget'}</button>
            </div>
          ) : null}
        </div>

        <div className="cluster-health-builder-actions">
          <span>{de ? 'Maus, Touch und Pfeiltasten werden unterstützt. Die Anzeige nutzt nur schreibgeschützte Statusdaten.' : 'Mouse, touch and arrow keys are supported. The display only exposes read-only status data.'}</span>
          <button type="button" className="btn-primary" onClick={save} disabled={saving}>{saving ? (de ? 'Speichert…' : 'Saving…') : (de ? 'Display speichern' : 'Save display')}</button>
        </div>
      </section>
    </div>
  );
}
