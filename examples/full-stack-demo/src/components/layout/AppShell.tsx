import { useState, type ReactNode } from 'react';
import { cx } from '../../lib/utils';
import { ToastHost } from '../ui/Feedback';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';

/** Persistent application chrome: sidebar, topbar, toast host and page outlet. */
export function AppShell({ children }: { children: ReactNode }) {
  const [navOpen, setNavOpen] = useState(false);

  return (
    <div className={cx('app-shell', navOpen && 'is-nav-open')}>
      <Sidebar onNavigate={() => setNavOpen(false)} />
      {navOpen ? <div className="nav-scrim" onClick={() => setNavOpen(false)} /> : null}
      <div className="app-main">
        <Topbar onMenu={() => setNavOpen((value) => !value)} />
        <main className="app-content">{children}</main>
      </div>
      <ToastHost />
    </div>
  );
}
