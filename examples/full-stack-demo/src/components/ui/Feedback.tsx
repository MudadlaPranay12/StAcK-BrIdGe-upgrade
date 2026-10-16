import { type ReactNode } from 'react';
import { cx } from '../../lib/utils';
import { useApp } from '../../app/AppContext';
import { Icon } from './Icon';
import { Button } from './Button';

export function Spinner({ large }: { large?: boolean }) {
  return <span className={cx('spinner', large && 'spinner--lg')} />;
}

export function Skeleton({ variant = 'text', className }: { variant?: 'text' | 'title' | 'card' | 'row' | 'thumb'; className?: string }) {
  return <span className={cx('skeleton', `skeleton--${variant}`, className)} />;
}

/** Centered loading placeholder used while a page's first request is in flight. */
export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="empty-state">
      <Spinner large />
      <span className="empty-text">{label}</span>
    </div>
  );
}

/** Error placeholder with a retry affordance. Never throws. */
export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="empty-state">
      <span className="empty-icon">
        <Icon name="alert" size={22} />
      </span>
      <span className="empty-title">Something went wrong</span>
      <span className="empty-text">{message}</span>
      {onRetry ? (
        <Button variant="secondary" icon="refresh" onClick={onRetry}>
          Try again
        </Button>
      ) : null}
    </div>
  );
}

/** Renders the global toast queue. Mounted once, inside the app shell. */
export function ToastHost(): ReactNode {
  const { toasts, dismissToast } = useApp();
  if (toasts.length === 0) return null;
  return (
    <div className="toast-stack" aria-live="polite">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={cx('toast', toast.tone === 'success' && 'toast--success', toast.tone === 'error' && 'toast--error', toast.tone === 'info' && 'toast--info')}
          role="status"
        >
          <Icon name={toast.tone === 'success' ? 'checkCircle' : toast.tone === 'error' ? 'xCircle' : 'info'} size={17} />
          <div className="stack grow">
            <span className="toast-title">{toast.title}</span>
            {toast.text ? <span className="toast-text">{toast.text}</span> : null}
          </div>
          <button className="toast-close" type="button" onClick={() => dismissToast(toast.id)} aria-label="Dismiss notification">
            <Icon name="close" size={15} />
          </button>
        </div>
      ))}
    </div>
  );
}
