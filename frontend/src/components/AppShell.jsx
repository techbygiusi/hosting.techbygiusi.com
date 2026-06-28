import { Link, useLocation } from 'react-router-dom';

export default function AppShell({ children }) {
  const location = useLocation();
  const isAdmin = location.pathname.startsWith('/admin');

  return (
    <div className="site-shell">
      <header className="site-header">
        <Link className="brand" to="/" aria-label="Picly Startseite">
          <span className="brand-mark">P</span>
          <span className="brand-text">Picly by TechByGiusi</span>
        </Link>
        <nav className="site-nav" aria-label="Navigation">
          <Link className={isAdmin ? 'nav-link' : 'nav-link active'} to="/">Upload</Link>
          <Link className={isAdmin ? 'nav-link active' : 'nav-link'} to="/admin">Admin</Link>
        </nav>
      </header>

      <main className="site-main">{children}</main>

      <footer className="site-footer">
        <span>TechByGiusi</span>
        <span>AGPL-3.0</span>
      </footer>
    </div>
  );
}
