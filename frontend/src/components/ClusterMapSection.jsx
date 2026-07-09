import React, { useEffect, useMemo, useState } from 'react';
import { CircleMarker, MapContainer, Popup, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

function getBodyTheme() {
  if (typeof document === 'undefined') return 'light';
  return document.body.classList.contains('theme-dark') ? 'dark' : 'light';
}

function MapBounds({ points }) {
  const map = useMap();

  React.useEffect(() => {
    if (!points.length) return;

    const bounds = L.latLngBounds(points.map(point => [point.lat, point.lon]));
    const center = bounds.getCenter();
    const latSpan = Math.abs(bounds.getNorth() - bounds.getSouth());
    const lonSpan = Math.abs(bounds.getEast() - bounds.getWest());

    if (points.length === 1 || (latSpan < 8 && lonSpan < 12)) {
      map.setView([center.lat, center.lng], 4, { animate: false });
    } else {
      map.fitBounds(bounds, { padding: [30, 30], maxZoom: 4, animate: false });
    }

    setTimeout(() => map.invalidateSize(), 50);
  }, [map, points]);

  return null;
}

export default function ClusterMapSection({ clusters = [], mappedCount = 0, onOpenClusters }) {
  const [theme, setTheme] = useState(getBodyTheme);

  useEffect(() => {
    if (typeof document === 'undefined') return undefined;

    const updateTheme = () => setTheme(getBodyTheme());
    updateTheme();

    const observer = new MutationObserver(updateTheme);
    observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });

    return () => observer.disconnect();
  }, []);

  const isDark = theme === 'dark';
  const tileUrl = isDark
    ? 'https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png'
    : 'https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png';
    const markerStyle = isDark
    ? { color: '#101419', weight: 2, fillColor: '#c2cea7', fillOpacity: 0.95 }
    : { color: '#ffffff', weight: 2, fillColor: '#7a876f', fillOpacity: 0.95 };

  const points = useMemo(() => (
    (Array.isArray(clusters) ? clusters : [])
      .map(cluster => ({
        id: cluster.id,
        name: cluster.name,
        url: cluster.url,
        label: cluster.location_label || '',
        lat: Number(cluster.location_lat),
        lon: Number(cluster.location_lon),
        online: cluster.totals?.online || 0,
        nodes: cluster.totals?.nodes || (Array.isArray(cluster.nodes) ? cluster.nodes.length : 0),
        error: cluster.error || ''
      }))
      .filter(item => Number.isFinite(item.lat) && Number.isFinite(item.lon))
  ), [clusters]);

  return (
    <section className="panel-card cluster-map-card">
      <div className="panel-header cluster-map-header">
        <div>
          <h2>Cluster-Standorte</h2>
          <p>{mappedCount || points.length} von {clusters.length} Cluster mit Karten-Standort</p>
        </div>
        {onOpenClusters && (
          <button type="button" className="btn-secondary btn-small" onClick={onOpenClusters}>
            Cluster verwalten
          </button>
        )}
      </div>

      {points.length === 0 ? (
        <div className="empty-state soft-box cluster-map-empty">
          <h2>Keine Karten-Standorte hinterlegt</h2>
          <p>Öffne einen Proxmox-Cluster, suche nach der Adresse und wähle einen Standort aus dem Dropdown aus.</p>
        </div>
      ) : (
        <div className="cluster-map-layout">
          <div className="cluster-map-canvas">
            <MapContainer center={[51, 10]} zoom={4} minZoom={2} scrollWheelZoom={false} attributionControl={false} className="cluster-map-widget">
              <TileLayer url={tileUrl} subdomains={['a', 'b', 'c', 'd']} />
              <MapBounds points={points} />
              {points.map(point => (
                <CircleMarker key={point.id} center={[point.lat, point.lon]} radius={8} pathOptions={markerStyle}>
                  <Popup>
                    <strong>{point.name}</strong>
                    <div>{point.label}</div>
                    <div>{point.online}/{point.nodes} Nodes online</div>
                    {point.url ? <div>{point.url}</div> : null}
                  </Popup>
                </CircleMarker>
              ))}
            </MapContainer>
          </div>

          <div className="cluster-map-summary">
            {points.map(point => (
              <div key={point.id} className="cluster-map-summary-item">
                <div>
                  <strong>{point.name}</strong>
                  <span>{point.label}</span>
                </div>
                <span className={`status-badge ${point.error ? 'status-stopped' : 'status-running'}`}>
                  {point.error ? 'Problem' : `${point.online}/${point.nodes} Nodes`}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
