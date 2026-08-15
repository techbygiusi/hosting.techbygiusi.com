import React, { useEffect, useState } from 'react';

const STORAGE_KEY = 'site_theme';
const EVENT_NAME = 'portal-theme-change';

export function setDocumentTheme(theme) {
  if (typeof document === 'undefined') return;
  const nextTheme = theme === 'dark' ? 'dark' : 'light';
  document.body.classList.remove('theme-light', 'theme-dark');
  document.body.classList.add(`theme-${nextTheme}`);
  localStorage.setItem(STORAGE_KEY, nextTheme);
  document.cookie = `site_theme=${nextTheme}; max-age=31536000; path=/`;
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: { theme: nextTheme } }));
}

export function getSavedTheme() {
  if (typeof window === 'undefined') return 'light';
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved === 'dark' || saved === 'light') return saved;
  return 'light';
}

export function useDocumentTheme() {
  useEffect(() => {
    setDocumentTheme(getSavedTheme());
  }, []);
}

export function useTheme() {
  const [theme, setThemeState] = useState(getSavedTheme);

  useEffect(() => {
    const handleChange = (event) => {
      const nextTheme = event?.detail?.theme || getSavedTheme();
      setThemeState(nextTheme);
    };
    window.addEventListener(EVENT_NAME, handleChange);
    return () => window.removeEventListener(EVENT_NAME, handleChange);
  }, []);

  const setTheme = (nextTheme) => setDocumentTheme(nextTheme);

  return { theme, setTheme };
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

export default function ThemeButton() {
  const { theme, setTheme } = useTheme();

  const toggleTheme = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
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
