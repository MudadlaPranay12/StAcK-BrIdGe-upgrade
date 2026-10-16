// Minimal History-API router. Vite's dev server serves index.html for unknown
// paths (SPA fallback), so real, shareable URLs work without extra config.

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState, type MouseEvent, type ReactNode } from 'react';

export interface RouteMatch {
  params: Record<string, string>;
}

interface RouterValue {
  path: string;
  search: string;
  navigate: (to: string, options?: { replace?: boolean }) => void;
  match: (pattern: string) => RouteMatch | null;
}

const RouterContext = createContext<RouterValue | null>(null);

export function matchRoute(pattern: string, path: string): RouteMatch | null {
  const patternParts = pattern.split('/').filter(Boolean);
  const pathParts = path.split('/').filter(Boolean);
  if (patternParts.length !== pathParts.length) return null;
  const params: Record<string, string> = {};
  for (let index = 0; index < patternParts.length; index++) {
    const expected = patternParts[index] as string;
    const actual = pathParts[index] as string;
    if (expected.startsWith(':')) {
      params[expected.slice(1)] = decodeURIComponent(actual);
    } else if (expected !== actual) {
      return null;
    }
  }
  return { params };
}

export function RouterProvider({ children }: { children: ReactNode }) {
  const [location, setLocation] = useState(() => ({
    path: window.location.pathname,
    search: window.location.search,
  }));

  useEffect(() => {
    const sync = () => setLocation({ path: window.location.pathname, search: window.location.search });
    window.addEventListener('popstate', sync);
    return () => window.removeEventListener('popstate', sync);
  }, []);

  const navigate = useCallback((to: string, options?: { replace?: boolean }) => {
    const current = window.location.pathname + window.location.search;
    if (to === current) return;
    if (options?.replace) window.history.replaceState(null, '', to);
    else window.history.pushState(null, '', to);
    setLocation({ path: window.location.pathname, search: window.location.search });
    window.scrollTo({ top: 0 });
  }, []);

  const value = useMemo<RouterValue>(
    () => ({
      path: location.path,
      search: location.search,
      navigate,
      match: (pattern: string) => matchRoute(pattern, location.path),
    }),
    [location.path, location.search, navigate]
  );

  return <RouterContext.Provider value={value}>{children}</RouterContext.Provider>;
}

export function useRouter(): RouterValue {
  const value = useContext(RouterContext);
  if (!value) throw new Error('useRouter must be used inside <RouterProvider>.');
  return value;
}

interface LinkProps extends Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> {
  to: string;
  children: ReactNode;
}

/**
 * Anchor that performs client-side navigation. Real hrefs are preserved so
 * open-in-new-tab and copy-link still work; modified clicks fall through to the
 * browser's default behaviour.
 */
export function Link({ to, children, onClick, ...rest }: LinkProps) {
  const { navigate } = useRouter();

  const handleClick = useCallback(
    (event: MouseEvent<HTMLAnchorElement>) => {
      onClick?.(event);
      if (event.defaultPrevented) return;
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      navigate(to);
    },
    [navigate, onClick, to]
  );

  return (
    <a href={to} onClick={handleClick} {...rest}>
      {children}
    </a>
  );
}
