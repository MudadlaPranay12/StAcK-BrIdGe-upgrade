import { type ReactNode } from 'react';
import { Link, useRouter } from '../../lib/router';
import { useApp } from '../../app/AppContext';
import { cx } from '../../lib/utils';
import { Icon, type IconName } from '../ui/Icon';

interface NavLink {
  to: string;
  label: string;
  icon: IconName;
  match: (path: string) => boolean;
}

interface NavGroup {
  title: string;
  links: NavLink[];
}

const isExact = (prefix: string) => (path: string) => path === prefix;
const isPrefix = (prefix: string) => (path: string) => path === prefix || path.startsWith(`${prefix}/`);

const GROUPS: NavGroup[] = [
  {
    title: 'Main',
    links: [
      { to: '/', label: 'Overview', icon: 'grid', match: isExact('/') },
      { to: '/analytics', label: 'Analytics', icon: 'chart', match: isPrefix('/analytics') },
    ],
  },
  {
    title: 'Catalogue',
    links: [
      { to: '/products', label: 'Products', icon: 'box', match: isPrefix('/products') },
      { to: '/orders', label: 'Orders', icon: 'receipt', match: isPrefix('/orders') },
      { to: '/customers', label: 'Customers', icon: 'users', match: isPrefix('/customers') },
    ],
  },
  {
    title: 'Storefront',
    links: [
      { to: '/storefront', label: 'Browse store', icon: 'store', match: isPrefix('/storefront') },
      { to: '/checkout', label: 'Checkout', icon: 'cart', match: isPrefix('/checkout') },
    ],
  },
  {
    title: 'Developer',
    links: [
      { to: '/debug', label: 'Debug Lab', icon: 'flask', match: isPrefix('/debug') },
      { to: '/settings', label: 'Settings', icon: 'settings', match: isPrefix('/settings') },
    ],
  },
];

export function Sidebar({ onNavigate }: { onNavigate?: () => void }): ReactNode {
  const { path } = useRouter();
  const { storeName, cartCount } = useApp();

  return (
    <aside className="app-sidebar">
      <div className="brand">
        <span className="brand-mark">N</span>
        <div className="stack">
          <span className="brand-name">{storeName}</span>
          <span className="brand-sub">Operations console</span>
        </div>
      </div>

      <nav className="nav-scroll">
        {GROUPS.map((group) => (
          <div className="nav-section" key={group.title}>
            <div className="nav-section-title">{group.title}</div>
            <ul className="nav-list">
              {group.links.map((link) => {
                const active = link.match(path);
                return (
                  <li key={link.to}>
                    <Link className={cx('nav-item', active && 'is-active')} to={link.to} onClick={onNavigate} aria-current={active ? 'page' : undefined}>
                      <span className="nav-icon">
                        <Icon name={link.icon} size={16} />
                      </span>
                      <span className="nav-label">{link.label}</span>
                      {link.to === '/checkout' && cartCount > 0 ? <span className="nav-count">{cartCount}</span> : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="sidebar-foot">
        <div className="sidebar-env">
          <span className="status-dot" style={{ background: 'var(--success)' }} />
          <span className="grow">Local demo · API :4000</span>
        </div>
      </div>
    </aside>
  );
}
