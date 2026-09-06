import React from 'react';
import { ServerIcon, DashboardIcon, ClockIcon, LinkIcon, GlobeIcon } from './Icons';

function clamp(value) {
  return Math.max(0, Math.min(100, Number(value || 0)));
}

export function formatDisplayBytes(bytes) {
  const value = Number(bytes || 0);
  if (!Number.isFinite(value) || value <= 0) return '0 GB';
  const gb = value / (1024 ** 3);
  if (gb >= 1024) return `${(gb / 1024).toFixed(gb >= 10240 ? 0 : 1)} TB`;
  return `${gb.toFixed(gb >= 100 ? 0 : gb >= 10 ? 1 : 2)} GB`;
}

export function formatDisplayUptime(seconds) {
  const value = Math.max(0, Number(seconds || 0));
  const days = Math.floor(value / 86400);
  const hours = Math.floor((value % 86400) / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  if (days) return `${days}d ${hours}h`;
  if (hours) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function Meter({ value }) {
  const width = clamp(value);
  return <div className="health-display-meter"><span style={{ width: `${width}%` }} /></div>;
}

function MetricWidget({ label, value, detail, percent, icon: Icon = null }) {
  return (
    <div className="health-display-metric-widget">
      <div className="health-display-widget-label-row">
        <span className="health-display-widget-label">{label}</span>
        {Icon ? <Icon size={15} /> : null}
      </div>
      <strong className="health-display-big-value">{value}</strong>
      {detail ? <small>{detail}</small> : null}
      {percent !== undefined ? <Meter value={percent} /> : null}
    </div>
  );
}

function statusTone(state) {
  if (state === 'online') return 'success';
  if (state === 'offline') return 'danger';
  if (state === 'disabled' || state === 'unconfigured') return 'warning';
  return '';
}

function safeTimeZone(timezone) {
  const value = String(timezone || 'Europe/Berlin').trim() || 'Europe/Berlin';
  try {
    new Intl.DateTimeFormat('en', { timeZone: value }).format(new Date());
    return value;
  } catch (_) {
    return 'Europe/Berlin';
  }
}

function timeZoneLabel(timezone) {
  if (timezone === 'UTC') return 'UTC';
  const parts = String(timezone || '').split('/');
  return (parts[parts.length - 1] || timezone || '').replaceAll('_', ' ');
}

export default function ClusterHealthWidget({ widget, cluster, now = new Date(), preview = false, language = 'en' }) {
  const de = language === 'de';
  const type = widget?.type || 'cluster';
  const label = widget?.label || '';
  const totals = cluster?.totals || {};
  const offline = !!cluster?.error || (Number(totals.nodes || 0) > 0 && Number(totals.online || 0) < Number(totals.nodes || 0));

  if (type === 'logo') {
    return (
      <div className="health-display-logo-widget">
        <img src="/brand-logo.png" alt="Hosting by TechByGiusi" draggable="false" />
      </div>
    );
  }

  if (type === 'clock') {
    const timezone = safeTimeZone(widget?.timezone);
    const is12Hour = widget?.timeFormat === '12h';
    const locale = de ? 'de-DE' : (is12Hour ? 'en-US' : 'en-GB');
    const time = now.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', hour12: is12Hour, timeZone: timezone });
    const date = now.toLocaleDateString(de ? 'de-DE' : 'en-GB', { weekday: 'short', day: '2-digit', month: '2-digit', timeZone: timezone });
    return (
      <div className="health-display-clock-widget" title={timezone}>
        <ClockIcon size={preview ? 18 : 22} />
        <div>
          <strong>{time}</strong>
          <span>{date} · {timeZoneLabel(timezone)}</span>
        </div>
      </div>
    );
  }

  if (!cluster) {
    return (
      <div className="health-display-missing-widget">
        <ServerIcon size={20} />
        <strong>{label || (de ? 'Cluster wählen' : 'Choose cluster')}</strong>
        <span>{de ? 'Kein Cluster ausgewählt' : 'No cluster selected'}</span>
      </div>
    );
  }

  if (type === 'cluster') {
    return (
      <div className="health-display-cluster-widget">
        <div className="health-display-cluster-icon"><DashboardIcon size={preview ? 19 : 24} /></div>
        <div className="health-display-cluster-copy">
          <span>{label || cluster.name}</span>
          <strong>{cluster.error ? (de ? 'Nicht erreichbar' : 'Unavailable') : offline ? (de ? 'Beeinträchtigt' : 'Degraded') : (de ? 'Gesund' : 'Healthy')}</strong>
          <small>{totals.online || 0} / {totals.nodes || 0} {de ? 'Nodes online' : 'nodes online'}</small>
        </div>
        <span className={`health-display-state-dot ${cluster.error ? 'danger' : offline ? 'warning' : 'success'}`} />
      </div>
    );
  }

  if (type === 'cpu') {
    const percent = clamp(totals.cpuPercent);
    return <MetricWidget label={label || `${cluster.name} CPU`} value={`${percent.toFixed(1)}%`} detail={`${totals.online || 0} nodes online`} percent={percent} />;
  }

  if (type === 'memory') {
    const percent = clamp(totals.memPercent);
    return <MetricWidget label={label || `${cluster.name} ${de ? 'RAM' : 'Memory'}`} value={`${percent.toFixed(0)}%`} detail={`${formatDisplayBytes(totals.mem)} / ${formatDisplayBytes(totals.maxmem)}`} percent={percent} />;
  }

  if (type === 'storage') {
    const percent = clamp(totals.storagePercent);
    return <MetricWidget label={label || `${cluster.name} ${de ? 'Speicher' : 'Storage'}`} value={`${percent.toFixed(0)}%`} detail={`${formatDisplayBytes(totals.storageUsed)} / ${formatDisplayBytes(totals.storageTotal)}`} percent={percent} />;
  }

  if (type === 'uptime') {
    const onlineNodes = (cluster.nodes || []).filter((node) => node.status === 'online');
    const shortest = onlineNodes.length ? Math.min(...onlineNodes.map((node) => Number(node.uptime || 0))) : 0;
    return <MetricWidget label={label || `${cluster.name} ${de ? 'Laufzeit' : 'Uptime'}`} value={formatDisplayUptime(shortest)} detail={de ? 'Kürzeste Node-Laufzeit' : 'Shortest node uptime'} />;
  }

  if (type === 'pangolin') {
    const pangolin = cluster.pangolin || { state: 'unknown' };
    const stateText = pangolin.state === 'online'
      ? (de ? 'Online' : 'Online')
      : pangolin.state === 'offline'
        ? (de ? 'Nicht erreichbar' : 'Unavailable')
        : pangolin.state === 'disabled'
          ? (de ? 'Deaktiviert' : 'Disabled')
          : pangolin.state === 'unconfigured'
            ? (de ? 'Nicht konfiguriert' : 'Not configured')
            : (de ? 'Unbekannt' : 'Unknown');
    return (
      <div className="health-display-status-widget">
        <div className="health-display-status-icon"><LinkIcon size={preview ? 18 : 22} /></div>
        <div className="health-display-status-copy">
          <span>{label || `${cluster.name} Pangolin`}</span>
          <strong>{stateText}</strong>
          <small>{pangolin.baseDomain || pangolin.message || (de ? 'Publishing Status' : 'Publishing status')}</small>
        </div>
        <span className={`health-display-state-dot ${statusTone(pangolin.state)}`} />
      </div>
    );
  }

  if (type === 'services') {
    const count = Number(cluster.portalServices || 0);
    return <MetricWidget icon={ServerIcon} label={label || (de ? `${cluster.name} Services` : `${cluster.name} services`)} value={String(count)} detail={de ? 'Im Portal zugewiesen' : 'Assigned in portal'} />;
  }

  if (type === 'location') {
    return (
      <div className="health-display-status-widget">
        <div className="health-display-status-icon"><GlobeIcon size={preview ? 18 : 22} /></div>
        <div className="health-display-status-copy">
          <span>{label || (de ? 'Standort' : 'Location')}</span>
          <strong>{cluster.location || '—'}</strong>
          <small>{cluster.name}</small>
        </div>
      </div>
    );
  }

  if (type === 'nodes') {
    const compactHeight = Number(widget?.h || 0) <= 1;
    const compactWidth = Number(widget?.w || 0) <= 4;
    const maxNodes = compactHeight ? 3 : (compactWidth ? 4 : 6);
    return (
      <div className={`health-display-nodes-widget ${compactHeight ? 'compact-height' : ''} ${compactWidth ? 'compact-width' : ''}`}>
        {!compactHeight ? (
          <div className="health-display-nodes-head">
            <strong>{label || `${cluster.name} ${de ? 'Nodes' : 'nodes'}`}</strong>
            <span>{totals.online || 0}/{totals.nodes || 0}</span>
          </div>
        ) : null}
        <div className="health-display-node-list">
          {(cluster.nodes || []).slice(0, maxNodes).map((node) => (
            <div className={`health-display-node-row ${compactHeight ? 'compact' : ''} ${compactWidth ? 'narrow' : ''}`} key={node.node}>
              <span className={`health-display-state-dot ${node.status === 'online' ? 'success' : 'danger'}`} />
              <strong>{node.node}</strong>
              <span className="health-display-node-metrics">{compactHeight || compactWidth ? `CPU ${Number(node.cpuPercent || 0).toFixed(0)}% · RAM ${Number(node.memPercent || 0).toFixed(0)}%` : `CPU ${Number(node.cpuPercent || 0).toFixed(0)}%`}</span>
              {!compactHeight && !compactWidth ? <span>RAM {Number(node.memPercent || 0).toFixed(0)}%</span> : null}
            </div>
          ))}
          {!cluster.nodes?.length ? <div className="health-display-node-empty">{de ? 'Keine Node-Daten' : 'No node data'}</div> : null}
        </div>
      </div>
    );
  }

  return null;
}
