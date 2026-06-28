import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Setup from './pages/Setup';
import Login from './pages/Login';
import UserDashboard from './pages/UserDashboard';
import AdminDashboard from './pages/AdminDashboard';

function viewportIsMobile() {
  return window.matchMedia?.('(max-width: 767px)').matches ?? false;
}

function applyTheme(theme) {
  document.body.classList.remove('theme-light', 'theme-dark');
  document.body.classList.add(`theme-${theme}`);
  localStorage.setItem('site_theme', theme);
  document.cookie = `site_theme=${theme}; max-age=31536000; path=/`;
}

function getInitialTheme() {
  if (viewportIsMobile()) return 'light';

  const saved = localStorage.getItem('site_theme');
  if (saved === 'dark' || saved === 'light') return saved;

  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function ThemeToggle() {
  const [theme, setTheme] = useState(getInitialTheme);
  const [isMobile, setIsMobile] = useState(viewportIsMobile);

  useEffect(() => {
    const mediaQuery = window.matchMedia?.('(max-width: 767px)');
    const handleViewportChange = () => {
      const mobile = viewportIsMobile();
      setIsMobile(mobile);

      if (mobile) {
        setTheme('light');
        return;
      }

      const saved = localStorage.getItem('site_theme');
      setTheme(saved === 'dark' || saved === 'light' ? saved : 'light');
    };

    mediaQuery?.addEventListener?.('change', handleViewportChange);
    window.addEventListener('resize', handleViewportChange);

    return () => {
      mediaQuery?.removeEventListener?.('change', handleViewportChange);
      window.removeEventListener('resize', handleViewportChange);
    };
  }, []);

  useEffect(() => {
    applyTheme(isMobile ? 'light' : theme);
  }, [theme, isMobile]);

  if (isMobile) return null;

  const nextTheme = theme === 'dark' ? 'light' : 'dark';

  return (
    <button
      type="button"
      className="lamp-toggle"
      aria-label={theme === 'dark' ? 'Zum hellen Modus wechseln' : 'Zum dunklen Modus wechseln'}
      onClick={() => setTheme(nextTheme)}
    >
      <span className="lamp-cord" aria-hidden="true"></span>
      <span className="lamp-bulb" aria-hidden="true"></span>
    </button>
  );
}

function FullscreenLoader({ text }) {
  return (
    <div className="app-loader">
      <div className="spinner spinner-lg"></div>
      <div>{text}</div>
    </div>
  );
}

function PrivateRoute({ children, requiredRole = null }) {
  const { isAuthenticated, user, loading, setupRequired } = useAuth();

  if (loading) {
    return <FullscreenLoader text="Lädt..." />;
  }

  if (setupRequired) {
    return <Navigate to="/setup" />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" />;
  }

  if (requiredRole && user?.role !== requiredRole) {
    return <Navigate to="/login" />;
  }

  return children;
}

export default function App() {
  const { setupRequired, loading, isAuthenticated, user } = useAuth();

  if (loading) {
    return <FullscreenLoader text="Initialisierung..." />;
  }

  return (
    <BrowserRouter>
      <ThemeToggle />
      <Routes>
        <Route
          path="/setup"
          element={setupRequired ? <Setup /> : <Navigate to={isAuthenticated ? (user?.role === 'admin' ? '/admin' : '/dashboard') : '/login'} />}
        />

        <Route
          path="/login"
          element={
            setupRequired ?
              <Navigate to="/setup" /> :
              isAuthenticated ?
                <Navigate to={user?.role === 'admin' ? '/admin' : '/dashboard'} /> :
                <Login />
          }
        />

        <Route
          path="/dashboard"
          element={
            <PrivateRoute requiredRole="user">
              <UserDashboard />
            </PrivateRoute>
          }
        />

        <Route
          path="/admin"
          element={
            <PrivateRoute requiredRole="admin">
              <AdminDashboard />
            </PrivateRoute>
          }
        />

        <Route
          path="/"
          element={
            setupRequired ?
              <Navigate to="/setup" /> :
              isAuthenticated ?
                <Navigate to={user?.role === 'admin' ? '/admin' : '/dashboard'} /> :
                <Navigate to="/login" />
          }
        />

        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </BrowserRouter>
  );
}
