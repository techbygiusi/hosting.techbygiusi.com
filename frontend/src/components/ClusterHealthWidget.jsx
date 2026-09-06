import React from 'react';
import { ServerIcon, DashboardIcon, ClockIcon } from './Icons';

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

function MetricWidget({ label, value, detail, percent }) {
  return (
    <div className="health-display-metric-widget">
      <span className="health-display-widget-label">{label}</span>
      <strong className="health-display-big-value">{value}</strong>
      {detail ? <small>{detail}</small> : null}
      {percent !== undefined ? <Meter value={percent} /> : null}
    </div>
  );
}

export default function ClusterHealthWidget({ widget, cluster, now = new Date(), preview = false, language = 'en' }) {
  const de = language === 'de';
  const type = widget?.type || 'cluster';
  const label = widget?.label || '';
  const totals = cluster?.totals || {};
  const offline = !!cluster?.error || (Number(totals.nodes || 0) > 0 && Number(totals.online || 0) < Number(totals.nodes || 0));

  if (type === 'clock') {
    return (
      <div className="health-display-clock-widget">
        <ClockIcon size={preview ? 18 : 22} />
        <div>
          <strong>{now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</strong>
          <span>{now.toLocaleDateString([], { weekday: 'short', day: '2-digit', month: '2-digit' })}</span>
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

  if (type === 'nodes') {
    return (
      <div className="health-display-nodes-widget">
        <div className="health-display-nodes-head">
          <strong>{label || `${cluster.name} ${de ? 'Nodes' : 'nodes'}`}</strong>
          <span>{totals.online || 0}/{totals.nodes || 0}</span>
        </div>
        <div className="health-display-node-list">
          {(cluster.nodes || []).slice(0, 6).map((node) => (
            <div className="health-display-node-row" key={node.node}>
              <span className={`health-display-state-dot ${node.status === 'online' ? 'success' : 'danger'}`} />
              <strong>{node.node}</strong>
              <span>CPU {Number(node.cpuPercent || 0).toFixed(0)}%</span>
              <span>RAM {Number(node.memPercent || 0).toFixed(0)}%</span>
            </div>
          ))}
          {!cluster.nodes?.length ? <div className="health-display-node-empty">{de ? 'Keine Node-Daten' : 'No node data'}</div> : null}
        </div>
      </div>
    );
  }

  return null;
}
