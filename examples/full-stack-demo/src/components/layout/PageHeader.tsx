import { type ReactNode } from 'react';
import { useRouter } from '../../lib/router';
import { Breadcrumbs, type Crumb } from '../ui/Nav';

interface PageHeaderProps {
  eyebrow?: string;
  title: ReactNode;
  subtitle?: ReactNode;
  crumbs?: Crumb[];
  actions?: ReactNode;
}

export function PageHeader({ eyebrow, title, subtitle, crumbs, actions }: PageHeaderProps) {
  const { navigate } = useRouter();
  return (
    <div className="page-header">
      <div className="page-header-main">
        {eyebrow ? <span className="page-eyebrow">{eyebrow}</span> : null}
        <h1 className="page-title">{title}</h1>
        {subtitle ? <p className="page-subtitle">{subtitle}</p> : null}
        {crumbs && crumbs.length > 0 ? <Breadcrumbs items={crumbs} onNavigate={navigate} /> : null}
      </div>
      {actions ? <div className="page-actions">{actions}</div> : null}
    </div>
  );
}
