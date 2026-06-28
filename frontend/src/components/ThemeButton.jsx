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
    <button type="button" className="theme-button" onClick={toggleTheme}>
      {theme === 'dark' ? 'Hell' : 'Dunkel'}
    </button>
  );
}
