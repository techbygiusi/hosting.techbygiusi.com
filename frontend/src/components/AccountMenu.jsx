import React, { useEffect, useRef, useState } from 'react';
import Avatar from './Avatar';
import { ChevronDownIcon, LogoutIcon, HomeIcon, SunIcon, MoonIcon } from './Icons';
import { useTheme } from './ThemeButton';

const TEXT = {
  en: {
    account: 'Account',
    administrator: 'Administrator',
    user: 'User',
    settings: 'Account settings',
    logout: 'Log out',
    theme: 'Appearance',
    light: 'Light',
    dark: 'Dark',
    open: 'Open account menu'
  },
  de: {
    account: 'Konto',
    administrator: 'Administrator',
    user: 'Benutzer',
    settings: 'Kontoeinstellungen',
    logout: 'Abmelden',
    theme: 'Darstellung',
    light: 'Hell',
    dark: 'Dunkel',
    open: 'Kontomenü öffnen'
  }
};

/**
 * Account chip in the top-right corner: profile picture, display name and role,
 * with a dropdown for appearance, settings and sign-out. On touch layouts the
 * dropdown becomes a bottom sheet so it stays reachable with one thumb.
 */
export default function AccountMenu({ user, language = 'en', onOpenSettings, onLogout }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);
  const { theme, setTheme } = useTheme();
  const text = TEXT[language] || TEXT.en;
  const roleLabel = user?.role === 'admin' ? text.administrator : text.user;
  const displayName = user?.name || user?.email || text.account;

  useEffect(() => {
    if (!open) return undefined;
    const handlePointer = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) setOpen(false);
    };
    const handleKey = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handlePointer);
    document.addEventListener('touchstart', handlePointer);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handlePointer);
      document.removeEventListener('touchstart', handlePointer);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  return (
    <div className={`account-menu ${open ? 'open' : ''}`} ref={containerRef}>
      <button
        type="button"
        className="account-menu-trigger"
        onClick={() => setOpen(current => !current)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={text.open}
      >
        <Avatar src={user?.avatarUrl} name={user?.name} email={user?.email} size={38} />
        <span className="account-menu-identity">
          <strong>{displayName}</strong>
          <small>{roleLabel}</small>
        </span>
        <ChevronDownIcon size={16} className="account-menu-caret" />
      </button>

      {open && (
        <div className="account-menu-panel" role="menu">
          <div className="account-menu-head">
            <Avatar src={user?.avatarUrl} name={user?.name} email={user?.email} size={44} />
            <div>
              <strong>{displayName}</strong>
              <small>{user?.email}</small>
            </div>
          </div>

          <div className="account-menu-theme" role="group" aria-label={text.theme}>
            <span className="account-menu-label">{text.theme}</span>
            <div className="account-menu-theme-switch">
              <button
                type="button"
                className={theme === 'light' ? 'active' : ''}
                onClick={() => setTheme('light')}
              >
                <SunIcon size={16} />{text.light}
              </button>
              <button
                type="button"
                className={theme === 'dark' ? 'active' : ''}
                onClick={() => setTheme('dark')}
              >
                <MoonIcon size={16} />{text.dark}
              </button>
            </div>
          </div>

          {onOpenSettings && (
            <button
              type="button"
              className="account-menu-item"
              role="menuitem"
              onClick={() => { setOpen(false); onOpenSettings(); }}
            >
              <HomeIcon size={18} />{text.settings}
            </button>
          )}
          <button
            type="button"
            className="account-menu-item account-menu-item-danger"
            role="menuitem"
            onClick={() => { setOpen(false); onLogout(); }}
          >
            <LogoutIcon size={18} />{text.logout}
          </button>
        </div>
      )}
    </div>
  );
}
