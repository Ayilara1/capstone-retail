import React, { useState, useEffect, useCallback } from 'react';

export default function App() {
  const [products, setProducts] = useState([]);
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // 1. Fetch products from /api/products
      const productsRes = await fetch('/api/products');
      if (!productsRes.ok) {
        throw new Error(`HTTP ${productsRes.status}: ${productsRes.statusText}`);
      }
      const productsData = await productsRes.json();
      setProducts(productsData);

      // 2. Fetch health probe from /api/health
      try {
        const healthRes = await fetch('/api/health');
        if (healthRes.ok) {
          const healthData = await healthRes.json();
          setHealth(healthData);
        }
      } catch (healthErr) {
        console.warn('Health probe warning:', healthErr);
      }

      setLastUpdated(new Date().toLocaleTimeString());
    } catch (err) {
      console.error('Failed to fetch catalog items:', err);
      setError(err.message || 'Unable to communicate with the backend service.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Compute summary metrics
  const totalItems = products.length;
  const totalStock = products.reduce((acc, curr) => acc + (curr.stock || 0), 0);
  const totalValue = products.reduce((acc, curr) => acc + ((curr.price || 0) * (curr.stock || 0)), 0);

  return (
    <div className="dashboard-container">
      {/* Top Header */}
      <header className="dashboard-header">
        <div className="header-title-group">
          <div className="brand-icon">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
              <line x1="8" y1="21" x2="16" y2="21"></line>
              <line x1="12" y1="17" x2="12" y2="21"></line>
            </svg>
          </div>
          <div>
            <h1 className="dashboard-title">Cloud Retail Internal Dashboard</h1>
            <p className="dashboard-subtitle">
              <span>Production Workload</span>
              <span>•</span>
              <span>Amazon EKS &amp; RDS PostgreSQL</span>
            </p>
          </div>
        </div>

        <div className="header-actions">
          {error ? (
            <span className="badge badge-danger">
              <span className="status-dot"></span>
              Backend Offline
            </span>
          ) : (
            <span className="badge badge-success">
              <span className="status-dot pulse"></span>
              Platform Healthy
            </span>
          )}

          {lastUpdated && (
            <span className="badge badge-neutral">
              Updated: {lastUpdated}
            </span>
          )}

          <button 
            className="btn btn-primary" 
            onClick={fetchData} 
            disabled={loading}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: loading ? 'rotate(180deg)' : 'none', transition: 'transform 0.5s' }}>
              <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"></path>
            </svg>
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </header>

      {/* Microservice Architecture Status Banner */}
      <section className="arch-banner">
        <div className="arch-flow">
          <span className="arch-node">AWS ALB Ingress</span>
          <span className="arch-arrow">→</span>
          <span className="arch-node">frontend-ui (port 8080)</span>
          <span className="arch-arrow">→</span>
          <span className="arch-node">backend-api (port 8000)</span>
          <span className="arch-arrow">→</span>
          <span className="arch-node">Amazon RDS (PostgreSQL)</span>
        </div>
        <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
          Reverse Proxy: <code>/api/*</code> → Internal K8s DNS
        </div>
      </section>

      {/* Error Alert State */}
      {error && (
        <section className="alert-card">
          <div className="alert-header">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="8" x2="12" y2="12"></line>
              <line x1="12" y1="16" x2="12.01" y2="16"></line>
            </svg>
            <span>Backend or Database Connection Error</span>
          </div>
          <p className="alert-message">
            Failed to fetch products from <code>/api/products</code>. The frontend NGINX reverse proxy cannot reach the backend API or the backend cannot connect to Amazon RDS.
          </p>
          <div className="alert-help-box">
            <strong>Diagnostic checklist for students:</strong><br />
            1. Verify backend pods are Running: <code>kubectl get pods -n backend</code><br />
            2. Verify RDS credentials synced via ESO: <code>kubectl get externalsecrets -n backend</code><br />
            3. Check backend service DNS: <code>http://backend-api.backend.svc.cluster.local:8000</code><br />
            4. Error detail: {error}
          </div>
          <div>
            <button className="btn btn-secondary" onClick={fetchData}>
              Try Again
            </button>
          </div>
        </section>
      )}

      {/* Metrics Summary Grid */}
      <section className="metrics-grid">
        <div className="metric-card">
          <span className="metric-label">Catalog Products</span>
          <span className="metric-value">{loading ? '...' : totalItems}</span>
          <span className="metric-footnote">Items auto-seeded in DB</span>
        </div>

        <div className="metric-card">
          <span className="metric-label">Total Units in Stock</span>
          <span className="metric-value">{loading ? '...' : totalStock.toLocaleString()}</span>
          <span className="metric-footnote">Across all retail SKUs</span>
        </div>

        <div className="metric-card">
          <span className="metric-label">Inventory Valuation</span>
          <span className="metric-value">{loading ? '...' : `$${totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}</span>
          <span className="metric-footnote">Current catalog value</span>
        </div>

        <div className="metric-card">
          <span className="metric-label">Database Connection</span>
          <span className="metric-value" style={{ fontSize: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: health?.database === 'connected' ? 'var(--success)' : 'var(--warning)' }}>
            <span className="status-dot"></span>
            {health?.database === 'connected' ? 'Connected' : (error ? 'Disconnected' : 'Checking...')}
          </span>
          <span className="metric-footnote">{health?.database_host ? `RDS: ${health.database_host}` : 'PostgreSQL 16'}</span>
        </div>
      </section>

      {/* Live Catalog Table Card */}
      <section className="content-card">
        <div className="card-header">
          <h2 className="card-title">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"></path>
              <line x1="3" y1="6" x2="21" y2="6"></line>
              <path d="M16 10a4 4 0 0 1-8 0"></path>
            </svg>
            Live Product Catalog (Fetched from <code>/api/products</code>)
          </h2>
          <span style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
            Real-time querying via FastAPI &amp; PostgreSQL
          </span>
        </div>

        <div className="table-responsive">
          <table className="retail-table">
            <thead>
              <tr>
                <th style={{ width: '80px' }}>ID</th>
                <th>Product Information</th>
                <th style={{ width: '150px' }}>Unit Price</th>
                <th style={{ width: '130px' }}>Stock Qty</th>
                <th style={{ width: '140px' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                // Loading Skeleton Rows
                Array.from({ length: 3 }).map((_, index) => (
                  <tr key={index}>
                    <td><div className="skeleton" style={{ width: '30px' }}></div></td>
                    <td>
                      <div className="skeleton" style={{ width: '180px', marginBottom: '8px' }}></div>
                      <div className="skeleton" style={{ width: '280px', height: '14px' }}></div>
                    </td>
                    <td><div className="skeleton" style={{ width: '70px' }}></div></td>
                    <td><div className="skeleton" style={{ width: '50px' }}></div></td>
                    <td><div className="skeleton" style={{ width: '80px' }}></div></td>
                  </tr>
                ))
              ) : products.length > 0 ? (
                products.map((product) => {
                  const isInStock = product.stock > 50;
                  const isLowStock = product.stock > 0 && product.stock <= 50;
                  return (
                    <tr key={product.id}>
                      <td className="product-id">#{product.id}</td>
                      <td>
                        <div className="product-name">{product.name}</div>
                        {product.description && (
                          <div className="product-description">{product.description}</div>
                        )}
                      </td>
                      <td>
                        <span className="product-price">
                          ${Number(product.price).toFixed(2)}
                        </span>
                      </td>
                      <td style={{ fontWeight: 600 }}>{product.stock}</td>
                      <td>
                        {isInStock && (
                          <span className="badge badge-success">
                            <span className="status-dot"></span> In Stock
                          </span>
                        )}
                        {isLowStock && (
                          <span className="badge badge-warning">
                            <span className="status-dot"></span> Low Stock
                          </span>
                        )}
                        {product.stock === 0 && (
                          <span className="badge badge-danger">
                            <span className="status-dot"></span> Out of Stock
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan="5" style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-secondary)' }}>
                    No products found in the catalog. The backend auto-seeding routine will populate items on initialization.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Footer */}
      <footer className="dashboard-footer">
        <p>Amazon EKS DevOps Capstone Workload • Designed for Zero-Code Container Packaging</p>
      </footer>
    </div>
  );
}
