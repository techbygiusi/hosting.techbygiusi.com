import { Link, useLocation } from 'react-router-dom';

export default function AppShell({ children }) {
  const location = useLocation();
  const isAdmin = location.pathname.startsWith('/admin');

  return (
    <div className={`site-shell ${isAdmin ? 'admin-shell' : 'upload-shell'}`}>
      <header className="site-header">
        <Link className="brand" to="/" aria-label="Startseite">
          <span className="brand-text">Florian &amp; Alexandra</span>
        </Link>
        <nav className="site-nav" aria-label="Navigation">
          <Link className={isAdmin ? 'nav-link' : 'nav-link active'} to="/">Fotos teilen</Link>
          <Link className={isAdmin ? 'nav-link active desktop-admin-link' : 'nav-link desktop-admin-link'} to="/admin">Admin</Link>
        </nav>
      </header>

      <main className="site-main">{children}</main>

      <footer className="site-footer">
        <span>Florian &amp; Alexandra · Hochzeit</span>
        <Link className={isAdmin ? 'footer-admin-link active' : 'footer-admin-link'} to="/admin">Admin</Link>
        <span>Picly by TechByGiusi</span>
      </footer>
    </div>
  );
}
