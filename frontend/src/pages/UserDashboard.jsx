import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { userApi } from '../services/api';
import '../styles/globals.css';

export default function UserDashboard() {
  const { user, logout } = useAuth();
  const [containers, setContainers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchContainers();
  }, []);

  const fetchContainers = async () => {
    try {
      setLoading(true);
      const response = await userApi.getContainers();
      setContainers(response.data.containers || []);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load containers');
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'running':
        return '#28a745';
      case 'stopped':
        return '#dc3545';
      default:
        return '#6c757d';
    }
  };

  const formatBytes = (bytes) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--color-bg-alt)' }}>
      <style>{`
        .dashboard-header {
          background: white;
          border-bottom: 1px solid var(--color-border);
          padding: var(--spacing-lg);
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: var(--spacing-md);
          position: sticky;
          top: 0;
          z-index: 100;
          flex-wrap: wrap;
        }
        
        .dashboard-title {
          display: flex;
          align-items: center;
          gap: var(--spacing-md);
        }
        
        .dashboard-title h1 {
          margin: 0;
          font-size: var(--font-size-xl);
          color: var(--color-primary);
        }
        
        .user-info {
          display: flex;
          align-items: center;
          gap: var(--spacing-md);
        }
        
        .logout-btn {
          background: var(--color-danger);
          color: white;
          border: none;
          padding: 8px 16px;
          border-radius: var(--radius-md);
          cursor: pointer;
          transition: var(--transition);
          min-height: auto;
        }
        
        .logout-btn:hover {
          background: #c82333;
        }
        
        .dashboard-content {
          padding: var(--spacing-lg);
          max-width: 1200px;
          margin: 0 auto;
        }
        
        .container-grid {
          display: grid;
          gap: var(--spacing-md);
          grid-template-columns: 1fr;
        }
        
        @media (min-width: 480px) {
          .container-grid {
            grid-template-columns: repeat(2, 1fr);
          }
        }
        
        @media (min-width: 768px) {
          .container-grid {
            grid-template-columns: repeat(2, 1fr);
          }
        }
        
        @media (min-width: 1024px) {
          .container-grid {
            grid-template-columns: repeat(3, 1fr);
          }
        }
        
        .container-card {
          background: white;
          border-radius: var(--radius-lg);
          overflow: hidden;
          box-shadow: var(--shadow-md);
          transition: var(--transition);
          display: flex;
          flex-direction: column;
          height: 100%;
        }
        
        .container-card:hover {
          box-shadow: var(--shadow-lg);
          transform: translateY(-2px);
        }
        
        .container-header {
          background: linear-gradient(135deg, #0066cc 0%, #004fa3 100%);
          color: white;
          padding: var(--spacing-md);
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: var(--spacing-md);
        }
        
        .container-name {
          margin: 0;
          font-size: var(--font-size-lg);
          font-weight: 600;
          word-break: break-word;
        }
        
        .status-badge {
          padding: 4px 12px;
          border-radius: 20px;
          background: rgba(255, 255, 255, 0.3);
          color: white;
          font-size: var(--font-size-sm);
          font-weight: 500;
          flex-shrink: 0;
        }
        
        .container-body {
          padding: var(--spacing-md);
          flex: 1;
          overflow-y: auto;
        }
        
        .info-group {
          display: grid;
          gap: var(--spacing-md);
          margin-bottom: var(--spacing-md);
        }
        
        .info-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: var(--font-size-sm);
          padding: var(--spacing-sm) 0;
          border-bottom: 1px solid var(--color-border);
        }
        
        .info-item:last-child {
          border-bottom: none;
        }
        
        .info-label {
          color: var(--color-text-light);
          font-weight: 500;
        }
        
        .info-value {
          font-weight: 600;
          color: var(--color-text);
        }
        
        .progress-bar {
          height: 4px;
          background: var(--color-border);
          border-radius: 2px;
          overflow: hidden;
          margin-top: 4px;
        }
        
        .progress-fill {
          height: 100%;
          background: linear-gradient(90deg, #0066cc, #004fa3);
          transition: width 0.3s ease;
        }
        
        .ips-section {
          margin-top: var(--spacing-md);
          padding-top: var(--spacing-md);
          border-top: 1px solid var(--color-border);
        }
        
        .ips-label {
          font-size: var(--font-size-sm);
          font-weight: 600;
          color: var(--color-text-light);
          margin-bottom: 4px;
        }
        
        .ip-item {
          font-size: var(--font-size-sm);
          background: var(--color-bg-alt);
          padding: 6px 8px;
          border-radius: 4px;
          margin-bottom: 4px;
          font-family: 'Courier New', monospace;
          word-break: break-all;
        }
        
        .container-footer {
          padding: var(--spacing-md);
          border-top: 1px solid var(--color-border);
          background: var(--color-bg-alt);
        }
        
        .open-webui-btn {
          width: 100%;
          padding: var(--spacing-md);
          background: var(--color-primary);
          color: white;
          border: none;
          border-radius: var(--radius-md);
          cursor: pointer;
          font-weight: 500;
          transition: var(--transition);
          min-height: 40px;
        }
        
        .open-webui-btn:hover {
          background: var(--color-primary-dark);
          box-shadow: var(--shadow-md);
        }
        
        .open-webui-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        
        .empty-state {
          text-align: center;
          padding: var(--spacing-xl);
          color: var(--color-text-light);
        }
        
        .empty-state h2 {
          color: var(--color-text);
          margin-bottom: var(--spacing-md);
        }
        
        .loading-spinner {
          display: flex;
          justify-content: center;
          align-items: center;
          min-height: 200px;
          gap: var(--spacing-md);
        }
        
        .spinner {
          width: 30px;
          height: 30px;
          border: 3px solid var(--color-border);
          border-top-color: var(--color-primary);
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }
        
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>

      <div className="dashboard-header">
        <div className="dashboard-title">
          <h1>🖥️ My Containers</h1>
        </div>
        <div className="user-info">
          <span>{user?.name} ({user?.email})</span>
          <button className="logout-btn" onClick={logout}>
            Logout
          </button>
        </div>
      </div>

      <div className="dashboard-content">
        {error && (
          <div className="alert alert-danger" style={{ marginBottom: 'var(--spacing-lg)' }}>
            {error}
          </div>
        )}

        {loading ? (
          <div className="loading-spinner">
            <div className="spinner"></div>
            <span>Loading containers...</span>
          </div>
        ) : containers.length === 0 ? (
          <div className="empty-state">
            <h2>No Containers Assigned</h2>
            <p>You don't have any containers assigned yet. Please contact your administrator.</p>
          </div>
        ) : (
          <div className="container-grid">
            {containers.map((container) => {
              const memPercent = container.maxmem ? (container.mem / container.maxmem) * 100 : 0;
              const cpuPercent = container.maxcpu ? (container.cpu / container.maxcpu) * 100 : 0;
              const diskPercent = container.maxdisk ? (container.disk / container.maxdisk) * 100 : 0;

              return (
                <div key={`${container.clusterId}-${container.id}`} className="container-card">
                  <div className="container-header">
                    <h3 className="container-name">{container.name}</h3>
                    <div className="status-badge" style={{ backgroundColor: getStatusColor(container.status) }}>
                      {container.status.toUpperCase()}
                    </div>
                  </div>

                  <div className="container-body">
                    <div className="info-group">
                      <div>
                        <div className="info-item">
                          <span className="info-label">Type:</span>
                          <span className="info-value">{container.type.toUpperCase()}</span>
                        </div>
                        <div className="info-item">
                          <span className="info-label">Node:</span>
                          <span className="info-value">{container.node}</span>
                        </div>
                        <div className="info-item">
                          <span className="info-label">Cluster:</span>
                          <span className="info-value">{container.clusterName}</span>
                        </div>
                      </div>

                      <div>
                        <div className="info-label">CPU: {cpuPercent.toFixed(1)}%</div>
                        <div className="progress-bar">
                          <div className="progress-fill" style={{ width: `${Math.min(cpuPercent, 100)}%` }}></div>
                        </div>
                        <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-light)' }}>
                          {container.cpu}/{container.maxcpu} cores
                        </div>
                      </div>

                      <div>
                        <div className="info-label">Memory: {memPercent.toFixed(1)}%</div>
                        <div className="progress-bar">
                          <div className="progress-fill" style={{ width: `${Math.min(memPercent, 100)}%` }}></div>
                        </div>
                        <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-light)' }}>
                          {formatBytes(container.mem)} / {formatBytes(container.maxmem)}
                        </div>
                      </div>

                      <div>
                        <div className="info-label">Disk: {diskPercent.toFixed(1)}%</div>
                        <div className="progress-bar">
                          <div className="progress-fill" style={{ width: `${Math.min(diskPercent, 100)}%` }}></div>
                        </div>
                        <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-light)' }}>
                          {formatBytes(container.disk)} / {formatBytes(container.maxdisk)}
                        </div>
                      </div>
                    </div>

                    {container.ips && container.ips.length > 0 && (
                      <div className="ips-section">
                        <div className="ips-label">IP Addresses:</div>
                        {container.ips.map((ip, idx) => (
                          <div key={idx} className="ip-item">
                            {ip.ipv4 || ip.ipv6 || 'N/A'}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="container-footer">
                    <button
                      className="open-webui-btn"
                      onClick={() => {
                        if (container.webUiUrl) {
                          window.open(container.webUiUrl, '_blank');
                        }
                      }}
                      disabled={container.status !== 'running'}
                    >
                      {container.status === 'running' ? 'Open WebUI' : 'Container Offline'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
