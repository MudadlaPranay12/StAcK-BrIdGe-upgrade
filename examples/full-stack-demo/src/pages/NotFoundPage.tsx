import { useDocumentTitle } from '../lib/hooks';
import { useRouter } from '../lib/router';
import { EmptyState } from '../components/ui/Display';
import { Button } from '../components/ui/Button';

export function NotFoundPage() {
  useDocumentTitle('Not found — Northstar Commerce');
  const { navigate } = useRouter();

  return (
    <div className="page">
      <div className="empty-state">
        <span className="empty-icon" style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-3)' }}>
          404
        </span>
        <span className="empty-title">That page does not exist</span>
        <span className="empty-text">
          The route you requested isn&apos;t part of the console. Use the sidebar or head back to the
          dashboard.
        </span>
        <div className="row row--gap" style={{ marginTop: 8 }}>
          <Button variant="secondary" icon="chevronLeft" onClick={() => window.history.back()}>
            Go back
          </Button>
          <Button variant="primary" icon="grid" onClick={() => navigate('/')}>
            Open dashboard
          </Button>
        </div>
      </div>
    </div>
  );
}

export default NotFoundPage;
