import React, { useEffect, useMemo, useState } from 'react';
import BrandLogo from './BrandLogo';
import ThemeButton from './ThemeButton';
import LanguageSwitch from './LanguageSwitch';
import Avatar from './Avatar';
import { MenuIcon, CloseIcon, LogoutIcon } from './Icons';

export default function PortalShell({
  user,
  title,
  subtitle,
  navItems,
  activeKey,
  onSelect,
  onLogout,
  actions,
  children,
  toolbar,
  footer,
  language,
  onLanguageChange
}) {
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
  }, [activeKey]);

  const activeItem = useMemo(() => navItems.find((item) => item.key === activeKey), [navItems, activeKey]);
  const navGroups = useMemo(() => {
    const groups = [];
    for (const item of navItems) {
      const label = item.section || '';
      let group = groups.find((entry) => entry.label === label);
      if (!group) {
        group = { label, items: [] };
        groups.push(group);
      }
      group.items.push(item);
    }
    return groups;
  }, [navItems]);

  const renderNavigation = (mobile = false) => (
    <nav className={`portal-nav ${mobile ? 'mobile-nav' : ''}`} aria-label={mobile ? 'Mobile primary' : 'Primary'}>
      {navGroups.map((group) => (
        <div className="portal-nav-group" key={group.label || 'default'}>
          {group.label ? <span className="portal-nav-section-label">{group.label}</span> : null}
          <div className="portal-nav-group-items">
            {group.items.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.key}
                  type="button"
                  className={`portal-nav-item ${activeKey === item.key ? 'active' : ''}`}
                  onClick={() => onSelect(item.key)}
                >
                  {Icon ? <Icon size={18} /> : null}
                  <span>{item.label}</span>
                  {item.count !== undefined ? <span className="nav-count-clean">{item.count}</span> : null}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );

  return (
    <div className="portal-shell">
      <aside className="portal-sidebar desktop-only">
        <div className="portal-sidebar-top">
          <BrandLogo compact />
          {renderNavigation(false)}
        </div>

        <div className="portal-sidebar-bottom">
          <div className="sidebar-note card-soft">
            <p>Self-hosted. More freedom.</p>
            <small>Simple tools for infrastructure, apps and documentation.</small>
          </div>
          <button type="button" className="portal-logout" onClick={onLogout}>
            <LogoutIcon size={18} />
            <span>Logout</span>
          </button>
        </div>
      </aside>

      <div className="portal-main-area">
        <header className="portal-topbar">
          <div className="portal-topbar-mobile-brand mobile-only">
            <button type="button" className="icon-button" onClick={() => setMobileOpen(true)} aria-label="Open menu">
              <MenuIcon size={20} />
            </button>
            <BrandLogo compact />
          </div>
          <div className="portal-topbar-search-wrap">
            {toolbar || <div className="topbar-placeholder" />}
          </div>
          <div className="portal-topbar-actions">
            <ThemeButton />
            <LanguageSwitch value={language} onChange={onLanguageChange} />
            {actions}
            <div className="topbar-user-chip">
              <Avatar src={user?.avatarUrl} name={user?.name} email={user?.email} size={36} />
              <div className="topbar-user-copy desktop-only-inline">
                <strong>{user?.name || user?.email || 'User'}</strong>
                <span>{user?.role === 'admin' ? 'Administrator' : 'User'}</span>
              </div>
            </div>
          </div>
        </header>

        <div className="portal-page-heading">
          <div>
            <h1>{title}</h1>
            {subtitle ? <p>{subtitle}</p> : null}
          </div>
          {activeItem?.badge ? <span className="pill pill-neutral">{activeItem.badge}</span> : null}
        </div>

        <main className="portal-content">{children}</main>
        {footer ? <footer className="portal-footer">{footer}</footer> : null}
      </div>

      <div className={`mobile-drawer-backdrop ${mobileOpen ? 'open' : ''}`} onClick={() => setMobileOpen(false)}>
        <div className="mobile-drawer" onClick={(event) => event.stopPropagation()}>
          <div className="mobile-drawer-header">
            <BrandLogo compact />
            <button type="button" className="icon-button" onClick={() => setMobileOpen(false)} aria-label="Close menu">
              <CloseIcon size={20} />
            </button>
          </div>
          <div className="mobile-drawer-user">
            <Avatar src={user?.avatarUrl} name={user?.name} email={user?.email} size={48} />
            <div>
              <strong>{user?.name || user?.email || 'User'}</strong>
              <p>{user?.email || ''}</p>
            </div>
          </div>
          {renderNavigation(true)}
          <div className="mobile-drawer-footer">
            <button type="button" className="portal-logout" onClick={onLogout}>
              <LogoutIcon size={18} />
              <span>Logout</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
