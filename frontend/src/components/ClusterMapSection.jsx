import React, { useMemo } from 'react';
import { MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

const DefaultIcon = L.icon({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

L.Marker.prototype.options.icon = DefaultIcon;

function MapBounds({ points }) {
  const map = useMap();

  React.useEffect(() => {
    if (!points.length) return;
    const bounds = L.latLngBounds(points.map(point => [point.lat, point.lon]));
    if (points.length === 1) {
      map.setView([points[0].lat, points[0].lon], 6, { animate: false });
    } else {
      map.fitBounds(bounds, { padding: [30, 30] });
    }
    setTimeout(() => map.invalidateSize(), 50);
  }, [map, points]);

  return null;
}

export default function ClusterMapSection({ clusters = [], mappedCount = 0, onOpenClusters }) {
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
            Cluster bearbeiten
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
            <MapContainer center={[51.1657, 10.4515]} zoom={5} scrollWheelZoom={false} className="cluster-map-widget">
              <TileLayer
                attribution='&copy; OpenStreetMap contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              <MapBounds points={points} />
              {points.map(point => (
                <Marker key={point.id} position={[point.lat, point.lon]}>
                  <Popup>
                    <strong>{point.name}</strong>
                    <div>{point.label}</div>
                    <div>{point.online}/{point.nodes} Nodes online</div>
                    {point.url ? <div>{point.url}</div> : null}
                  </Popup>
                </Marker>
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
