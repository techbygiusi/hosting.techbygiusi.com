import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Setup from './pages/Setup';
import Login from './pages/Login';
import ResetPassword from './pages/ResetPassword';
import UserDashboard from './pages/UserDashboard';
import AdminDashboard from './pages/AdminDashboard';
import ConsolePage from './pages/ConsolePage';
import WikiEditorPage from './pages/WikiEditorPage';
import { useDocumentTheme } from './components/ThemeButton';
import { usePortalLanguageRuntime } from './i18n';
import PageSkeleton from './components/PageSkeleton';


function useGlobalTransientMessages() {
  useEffect(() => {
    const timers = new Map();
    const fadeTimers = new Map();
    const selector = '.alert-success, .alert-danger, .inline-notice.success, .inline-notice.danger, .test-result.success, .test-result.error';
    const connectivityPattern = /(?:not reachable|unreachable|offline|connection refused|refused the connection|timed out|timeout|could not be resolved|backend unavailable|backend is unavailable|nicht erreichbar|verbindung abgelehnt|zeitüberschreitung|konnte nicht aufgelöst werden|ist offline)/i;

    const clearTimers = (element) => {
      const timer = timers.get(element);
      if (timer) window.clearTimeout(timer);
      timers.delete(element);
      const fadeTimer = fadeTimers.get(element);
      if (fadeTimer) window.clearTimeout(fadeTimer);
      fadeTimers.delete(element);
    };

    const schedule = (element) => {
      if (!(element instanceof HTMLElement)) return;
      clearTimers(element);
      element.classList.remove('message-auto-dismiss');
      element.style.removeProperty('display');
      const text = String(element.textContent || '').trim();
      if (element.dataset.persistent === 'true' || connectivityPattern.test(text)) return;
      const success = element.matches('.alert-success, .inline-notice.success, .test-result.success');
      const danger = element.matches('.alert-danger, .inline-notice.danger, .test-result.error');
      const delay = success ? 10000 : danger ? 30000 : 0;
      if (!delay) return;
      const timer = window.setTimeout(() => {
        element.classList.add('message-auto-dismiss');
        const fadeTimer = window.setTimeout(() => {
          element.style.display = 'none';
        }, 180);
        fadeTimers.set(element, fadeTimer);
      }, delay);
      timers.set(element, timer);
    };

    const scan = (node) => {
      if (!(node instanceof Element)) return;
      if (node.matches(selector)) schedule(node);
      node.querySelectorAll(selector).forEach(schedule);
    };

    scan(document.body);
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'childList') {
          mutation.addedNodes.forEach((node) => {
            if (node instanceof Element) scan(node);
          });
          if (mutation.target instanceof Element) {
            const message = mutation.target.closest(selector);
            if (message) schedule(message);
          }
        } else if (mutation.type === 'characterData') {
          const message = mutation.target.parentElement?.closest(selector);
          if (message) schedule(message);
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });

    return () => {
      observer.disconnect();
      timers.forEach((timer) => window.clearTimeout(timer));
      fadeTimers.forEach((timer) => window.clearTimeout(timer));
    };
  }, []);
}

function FullscreenLoader() {
  return <div className="app-loader app-loader-skeleton"><PageSkeleton variant="dashboard" /></div>;
}

function FullscreenError({ title, text }) {
  return (
    <div className="app-loader app-error">
      <div className="app-error-card">
        <p className="eyebrow">Hosting by TechByGiusi</p>
        <h1>{title}</h1>
        <p>{text}</p>
      </div>
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
  useEffect(() => {
    const url = new URL(window.location.href);
    if (!url.searchParams.has('__portalRefresh')) return;
    url.searchParams.delete('__portalRefresh');
    window.history.replaceState({}, document.title, `${url.pathname}${url.search}${url.hash}`);
  }, []);

  useDocumentTheme();
  usePortalLanguageRuntime();
  useGlobalTransientMessages();
  const { setupRequired, loading, isAuthenticated, user, error } = useAuth();

  if (loading) {
    return <FullscreenLoader text="Initialisierung..." />;
  }

  if (error && !isAuthenticated && error.includes('Backend')) {
    return <FullscreenError title="Backend nicht erreichbar" text={error} />;
  }

  return (
    <BrowserRouter>
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

        <Route path="/reset-password" element={<ResetPassword />} />

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
          path="/admin/wiki/:articleId"
          element={
            <PrivateRoute requiredRole="admin">
              <WikiEditorPage />
            </PrivateRoute>
          }
        />

        <Route
          path="/console/:resourceId"
          element={
            <PrivateRoute requiredRole="user">
              <ConsolePage />
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
