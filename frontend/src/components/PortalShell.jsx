import React, { useEffect, useMemo, useRef, useState } from 'react';
import BrandLogo from './BrandLogo';
import AccountMenu from './AccountMenu';
import Avatar from './Avatar';
import GlobalSearch from './GlobalSearch';
import PageSkeleton from './PageSkeleton';
import { MenuIcon, CloseIcon, LogoutIcon, SettingsIcon } from './Icons';

export default function PortalShell({
  user,
  title,
  subtitle,
  navItems,
  activeKey,
  onSelect,
  onLogout,
  onOpenSettings,
  actions,
  children,
  footer,
  language,
  onLanguageChange,
  searchItems = [],
  searchPlaceholder = 'Search services, users, clusters or pages…'
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [pageTransition, setPageTransition] = useState(false);
  const transitionTimer = useRef(null);

  useEffect(() => () => {
    if (transitionTimer.current) window.clearTimeout(transitionTimer.current);
  }, []);

  useEffect(() => {
    setMobileOpen(false);
  }, [activeKey]);

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

  const goTo = (key) => {
    if (key === activeKey) return;
    setPageTransition(true);
    onSelect(key);
    if (transitionTimer.current) window.clearTimeout(transitionTimer.current);
    transitionTimer.current = window.setTimeout(() => setPageTransition(false), 260);
  };


  const openSettings = () => {
    if (!onOpenSettings) return;
    setPageTransition(true);
    onOpenSettings();
    if (transitionTimer.current) window.clearTimeout(transitionTimer.current);
    transitionTimer.current = window.setTimeout(() => setPageTransition(false), 260);
  };

  const mergedSearchItems = useMemo(() => {
    const menuItems = navItems.map((item) => ({
      id: `menu-${item.key}`,
      label: item.label,
      description: item.section ? `${item.section} menu` : 'Portal menu',
      category: 'Menu',
      icon: item.icon,
      keywords: `${item.label} ${item.section || ''}`,
      onSelect: () => goTo(item.key)
    }));
    const customItems = searchItems.map((item) => ({
      ...item,
      onSelect: () => {
        setPageTransition(true);
        item.onSelect?.();
        if (transitionTimer.current) window.clearTimeout(transitionTimer.current);
        transitionTimer.current = window.setTimeout(() => setPageTransition(false), 260);
      }
    }));
    return [...customItems, ...menuItems];
  }, [navItems, searchItems, activeKey]);

  useEffect(() => {
    const onShortcut = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        document.querySelector('.global-search-trigger')?.click();
      }
    };
    window.addEventListener('keydown', onShortcut);
    return () => window.removeEventListener('keydown', onShortcut);
  }, []);

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
                  onClick={() => goTo(item.key)}
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

  const settingsLabel = language === 'de' ? 'Kontoeinstellungen' : 'Account settings';
  const logoutLabel = language === 'de' ? 'Abmelden' : 'Log out';

  return (
    <div className="portal-shell">
      <aside className="portal-sidebar desktop-only">
        <div className="portal-sidebar-top">
          <BrandLogo compact />
          {renderNavigation(false)}
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
            <GlobalSearch items={mergedSearchItems} placeholder={searchPlaceholder} />
          </div>
          <div className="portal-topbar-actions">
            {actions}
            <AccountMenu user={user} language={language} onLanguageChange={onLanguageChange} onOpenSettings={onOpenSettings ? openSettings : null} onLogout={onLogout} />
          </div>
        </header>

        <div className="portal-page-heading">
          <div>
            <h1>{title}</h1>
            {subtitle ? <p>{subtitle}</p> : null}
          </div>
        </div>

        <main className="portal-content">
          {pageTransition ? <PageSkeleton variant={['users', 'services', 'clusters', 'groups', 'audit'].includes(activeKey) ? 'table' : activeKey === 'settings' ? 'settings' : 'dashboard'} compact /> : children}
        </main>
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
            {onOpenSettings ? (
              <button type="button" className="mobile-account-action" onClick={() => { setMobileOpen(false); openSettings(); }}>
                <SettingsIcon size={18} /><span>{settingsLabel}</span>
              </button>
            ) : null}
            <button type="button" className="mobile-account-action danger" onClick={onLogout}>
              <LogoutIcon size={18} /><span>{logoutLabel}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
