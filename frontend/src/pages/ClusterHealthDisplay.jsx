import React, { useEffect, useMemo, useState } from 'react';
import { displayApi } from '../services/api';
import ClusterHealthWidget from '../components/ClusterHealthWidget';

export default function ClusterHealthDisplay() {
  const [payload, setPayload] = useState(null);
  const [error, setError] = useState('');
  const [now, setNow] = useState(new Date());
  const [scale, setScale] = useState(1);

  const load = async () => {
    try {
      const response = await displayApi.getClusterHealth();
      setPayload(response.data || null);
      setError('');
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Display unavailable');
    }
  };

  useEffect(() => { load(); }, []);
  const refreshSeconds = Number(payload?.config?.refreshSeconds || 10);
  useEffect(() => {
    const timer = window.setInterval(load, Math.max(5, refreshSeconds) * 1000);
    return () => window.clearInterval(timer);
  }, [refreshSeconds]);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    const updateScale = () => setScale(Math.min(window.innerWidth / 800, window.innerHeight / 480));
    updateScale();
    window.addEventListener('resize', updateScale);
    return () => window.removeEventListener('resize', updateScale);
  }, []);

  const clustersById = useMemo(() => new Map((payload?.clusters || []).map((cluster) => [Number(cluster.id), cluster])), [payload]);
  const config = payload?.config;

  if (!payload) {
    return <div className="health-kiosk-boot"><span className="health-kiosk-pulse" /><strong>Cluster Health</strong></div>;
  }

  if (config?.enabled === false) {
    return <div className="health-kiosk-boot"><strong>Cluster Health display disabled</strong></div>;
  }

  return (
    <div className={`health-kiosk-viewport theme-${config?.theme || 'dark'}`}>
      <div className="health-kiosk-stage" style={{ transform: `translate(-50%, -50%) scale(${scale})` }}>
        <div className="health-kiosk-header">
          <div><span>Hosting by TechByGiusi</span><strong>{config?.title || 'Cluster Health'}</strong></div>
          <span className="health-kiosk-live"><i /> LIVE</span>
        </div>
        {error ? <div className="health-kiosk-error">{error}</div> : null}
        <div className="health-kiosk-grid">
          {(config?.widgets || []).map((widget) => (
            <article
              key={widget.id}
              className="health-kiosk-card"
              style={{ gridColumn: `${widget.x + 1} / span ${widget.w}`, gridRow: `${widget.y + 1} / span ${widget.h}` }}
            >
              <ClusterHealthWidget widget={widget} cluster={clustersById.get(Number(widget.clusterId))} now={now} language={config?.language || 'en'} />
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}
