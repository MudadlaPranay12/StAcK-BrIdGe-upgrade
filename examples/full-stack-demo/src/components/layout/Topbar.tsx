import { useState, type ReactNode } from 'react';
import { Link, useRouter } from '../../lib/router';
import { useApp } from '../../app/AppContext';
import { IconButton } from '../ui/Button';
import { Icon } from '../ui/Icon';
import { Dropdown, DropdownItem } from '../ui/Overlay';
import { SearchBox } from '../ui/Form';

export function Topbar({ onMenu }: { onMenu: () => void }): ReactNode {
  const { navigate } = useRouter();
  const { theme, toggleTheme, settings, cartCount } = useApp();
  const [query, setQuery] = useState('');

  function submitSearch() {
    const trimmed = query.trim();
    if (!trimmed) return;
    navigate(`/products?search=${encodeURIComponent(trimmed)}`);
    setQuery('');
  }

  return (
    <header className="app-topbar">
      <IconButton icon="menu" label="Toggle navigation" variant="plain" className="sidebar-toggle" onClick={onMenu} />

      <div
        className="topbar-search"
        onKeyDown={(event) => {
          if (event.key === 'Enter') submitSearch();
        }}
      >
        <SearchBox value={query} onChange={setQuery} placeholder="Search products, orders, customers…" aria-label="Search the console" />
      </div>

      <div className="topbar-actions">
        <IconButton icon={theme === 'dark' ? 'sun' : 'moon'} label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'} variant="plain" onClick={toggleTheme} />

        <Link className="icon-button" to="/checkout" aria-label="Open checkout" title="Cart &amp; checkout" style={{ position: 'relative' }}>
          <Icon name="cart" size={17} />
          {cartCount > 0 ? <span className="notif-dot" style={{ background: 'var(--brand)' }} /> : null}
        </Link>

        <button className="icon-button" type="button" aria-label="Notifications" title="Notifications" style={{ position: 'relative' }}>
          <Icon name="bell" size={17} />
          <span className="notif-dot" />
        </button>

        <span className="topbar-divider" />

        <Dropdown
          trigger={
            <button className="user-chip" type="button" aria-label="Account menu">
              <span className="avatar avatar--sm">OP</span>
              <span className="stack" style={{ alignItems: 'flex-start', lineHeight: 1.1 }}>
                <span className="user-chip-name">Priya Raman</span>
                <span className="user-chip-role">Store operator</span>
              </span>
              <Icon name="chevronDown" size={14} />
            </button>
          }
        >
          <div className="dropdown-label">Signed in</div>
          <div className="dropdown-item" style={{ cursor: 'default' }}>
            <Icon name="mail" size={15} />
            {settings?.supportEmail ?? 'ops@northstar.demo'}
          </div>
          <div className="dropdown-divider" />
          <DropdownItem icon="store" onClick={() => navigate('/storefront')}>
            View storefront
          </DropdownItem>
          <DropdownItem icon="settings" onClick={() => navigate('/settings')}>
            Store settings
          </DropdownItem>
          <DropdownItem icon={theme === 'dark' ? 'sun' : 'moon'} onClick={toggleTheme}>
            {theme === 'dark' ? 'Light theme' : 'Dark theme'}
          </DropdownItem>
        </Dropdown>
      </div>
    </header>
  );
}
