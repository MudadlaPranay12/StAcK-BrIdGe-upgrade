import { Component, type ErrorInfo, type ReactNode } from 'react';
import { RouterProvider, useRouter } from './lib/router';
import { AppProvider, useApp } from './app/AppContext';
import { AppShell } from './components/layout/AppShell';
import { Icon } from './components/ui/Icon';
import { Button } from './components/ui/Button';
import { LoadingState } from './components/ui/Feedback';
import { DashboardPage } from './pages/DashboardPage';
import { ProductsPage } from './pages/ProductsPage';
import { OrdersPage } from './pages/OrdersPage';
import { CustomersPage } from './pages/CustomersPage';
import { StorefrontPage } from './pages/StorefrontPage';
import { StoreProductPage } from './pages/StoreProductPage';
import { CheckoutPage } from './pages/CheckoutPage';
import { AnalyticsPage } from './pages/AnalyticsPage';
import { SettingsPage } from './pages/SettingsPage';
import { DebugLabPage } from './pages/DebugLabPage';
import { NotFoundPage } from './pages/NotFoundPage';

interface BoundaryState {
  error: Error | null;
}

/**
 * Catches render-time crashes (an invalid state from a patched component, for
 * instance) and shows an inline recovery card instead of a white screen — a
 * patched component should never be able to take the whole console down.
 */
class ErrorBoundary extends Component<{ children: ReactNode }, BoundaryState> {
  state: BoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): BoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[northstar] render error', error, info.componentStack);
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div className="page">
          <div className="empty-state" style={{ maxWidth: 560 }}>
            <span className="empty-icon">
              <Icon name="alert" size={22} />
            </span>
            <span className="empty-title">This view crashed while rendering</span>
            <span className="empty-text">
              {this.state.error.message || 'Unknown render error'} — open the StackBridge panel to
              inspect the component that threw.
            </span>
            <div style={{ marginTop: 8 }}>
              <Button variant="primary" onClick={() => this.setState({ error: null })}>
                Try again
              </Button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function RouteView(): JSX.Element {
  const { path } = useRouter();
  const { settingsLoading } = useApp();

  const page = (() => {
    if (path === '/' || path === '') return <DashboardPage />;
    if (path === '/products') return <ProductsPage />;
    if (path === '/orders') return <OrdersPage />;
    if (path === '/customers') return <CustomersPage />;
    if (path === '/storefront') return <StorefrontPage />;
    if (path.startsWith('/storefront/')) return <StoreProductPage />;
    if (path === '/checkout') return <CheckoutPage />;
    if (path === '/analytics') return <AnalyticsPage />;
    if (path === '/settings') return <SettingsPage />;
    if (path === '/debug') return <DebugLabPage />;
    return <NotFoundPage />;
  })();

  if (settingsLoading) {
    return (
      <div className="page">
        <LoadingState label="Waking up the console — loading /api/settings…" />
      </div>
    );
  }

  return <ErrorBoundary key={path}>{page}</ErrorBoundary>;
}

export function App(): JSX.Element {
  return (
    <RouterProvider>
      <AppProvider>
        <AppShell>
          <RouteView />
        </AppShell>
      </AppProvider>
    </RouterProvider>
  );
}
