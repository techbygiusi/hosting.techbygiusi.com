import React, { useCallback, useEffect, useState } from 'react';
import { SunIcon, MoonIcon } from './Icons';

const THEME_EVENT = 'portal-theme-change';

function applyDocumentTheme(theme) {
  document.body.classList.remove('theme-light', 'theme-dark');
  document.body.classList.add(`theme-${theme}`);
  document.documentElement.style.colorScheme = theme;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', theme === 'dark' ? '#0b0d0b' : '#e8ebe4');
  localStorage.setItem('site_theme', theme);
  document.cookie = `site_theme=${theme}; max-age=31536000; path=/`;
}

function getSavedTheme() {
  const saved = localStorage.getItem('site_theme');
  if (saved === 'dark' || saved === 'light') return saved;

  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function useDocumentTheme() {
  useEffect(() => {
    applyDocumentTheme(getSavedTheme());
  }, []);
}

/**
 * Shared theme state. Every consumer (toggle button, account menu) stays in
 * sync through a window event instead of each keeping its own copy.
 */
export function useTheme() {
  const [theme, setThemeState] = useState(getSavedTheme);

  useEffect(() => {
    const handleChange = (event) => setThemeState(event.detail?.theme || getSavedTheme());
    window.addEventListener(THEME_EVENT, handleChange);
    return () => window.removeEventListener(THEME_EVENT, handleChange);
  }, []);

  const setTheme = useCallback((nextTheme) => {
    const normalized = nextTheme === 'dark' ? 'dark' : 'light';
    applyDocumentTheme(normalized);
    setThemeState(normalized);
    window.dispatchEvent(new CustomEvent(THEME_EVENT, { detail: { theme: normalized } }));
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  }, [theme, setTheme]);

  return { theme, setTheme, toggleTheme };
}

export default function ThemeButton() {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      type="button"
      className={`theme-toggle theme-toggle-${theme}`}
      onClick={toggleTheme}
      aria-label={theme === 'dark' ? 'Hellmodus aktivieren' : 'Dunkelmodus aktivieren'}
      title={theme === 'dark' ? 'Hellmodus' : 'Dunkelmodus'}
    >
      <span className="theme-toggle-icon theme-toggle-icon-light"><SunIcon size={15} /></span>
      <span className="theme-toggle-thumb" aria-hidden="true" />
      <span className="theme-toggle-icon theme-toggle-icon-dark"><MoonIcon size={15} /></span>
    </button>
  );
}
