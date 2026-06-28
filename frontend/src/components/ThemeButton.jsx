import React, { useEffect, useState } from 'react';

function isMobileViewport() {
  return window.matchMedia?.('(max-width: 767px)').matches ?? false;
}

function setDocumentTheme(theme) {
  document.body.classList.remove('theme-light', 'theme-dark');
  document.body.classList.add(`theme-${theme}`);
  localStorage.setItem('site_theme', theme);
  document.cookie = `site_theme=${theme}; max-age=31536000; path=/`;
}

function getSavedTheme() {
  if (isMobileViewport()) return 'light';

  const saved = localStorage.getItem('site_theme');
  if (saved === 'dark' || saved === 'light') return saved;

  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2" />
      <path d="M12 20v2" />
      <path d="M4.93 4.93l1.41 1.41" />
      <path d="M17.66 17.66l1.41 1.41" />
      <path d="M2 12h2" />
      <path d="M20 12h2" />
      <path d="M4.93 19.07l1.41-1.41" />
      <path d="M17.66 6.34l1.41-1.41" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M20 14.4A7.6 7.6 0 0 1 9.6 4a8.5 8.5 0 1 0 10.4 10.4z" />
    </svg>
  );
}

export function useDocumentTheme() {
  useEffect(() => {
    const applyCurrentTheme = () => {
      setDocumentTheme(isMobileViewport() ? 'light' : getSavedTheme());
    };

    applyCurrentTheme();

    const mediaQuery = window.matchMedia?.('(max-width: 767px)');
    mediaQuery?.addEventListener?.('change', applyCurrentTheme);
    window.addEventListener('resize', applyCurrentTheme);

    return () => {
      mediaQuery?.removeEventListener?.('change', applyCurrentTheme);
      window.removeEventListener('resize', applyCurrentTheme);
    };
  }, []);
}

export default function ThemeButton() {
  const [theme, setTheme] = useState(getSavedTheme);
  const [isMobile, setIsMobile] = useState(isMobileViewport);

  useEffect(() => {
    const handleViewport = () => {
      const mobile = isMobileViewport();
      setIsMobile(mobile);
      const nextTheme = mobile ? 'light' : getSavedTheme();
      setTheme(nextTheme);
      setDocumentTheme(nextTheme);
    };

    handleViewport();

    const mediaQuery = window.matchMedia?.('(max-width: 767px)');
    mediaQuery?.addEventListener?.('change', handleViewport);
    window.addEventListener('resize', handleViewport);

    return () => {
      mediaQuery?.removeEventListener?.('change', handleViewport);
      window.removeEventListener('resize', handleViewport);
    };
  }, []);

  if (isMobile) return null;

  const toggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    setDocumentTheme(nextTheme);
  };

  return (
    <button
      type="button"
      className={`theme-toggle theme-toggle-${theme}`}
      onClick={toggleTheme}
      aria-label={theme === 'dark' ? 'Hellmodus aktivieren' : 'Dunkelmodus aktivieren'}
      title={theme === 'dark' ? 'Hellmodus' : 'Dunkelmodus'}
    >
      <span className="theme-toggle-icon theme-toggle-icon-light"><SunIcon /></span>
      <span className="theme-toggle-thumb" aria-hidden="true" />
      <span className="theme-toggle-icon theme-toggle-icon-dark"><MoonIcon /></span>
    </button>
  );
}
