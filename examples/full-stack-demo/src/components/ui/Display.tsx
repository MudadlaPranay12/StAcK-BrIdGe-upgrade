import { type CSSProperties, type ReactNode } from 'react';
import { cx } from '../../lib/utils';
import { Icon, type IconName } from './Icon';

// ------------------------------------------------------------------- Card
interface CardProps {
  children: ReactNode;
  className?: string;
  interactive?: boolean;
  onClick?: () => void;
}

export function Card({ children, className, interactive, onClick }: CardProps) {
  return (
    <div className={cx('card', interactive && 'card--interactive', className)} onClick={onClick}>
      {children}
    </div>
  );
}

export function CardHeader({ title, subtitle, actions, plain }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; plain?: boolean }) {
  return (
    <div className={cx('card-header', plain && 'card-header--plain')}>
      <div className="stack grow">
        <span className="card-title">{title}</span>
        {subtitle ? <span className="card-subtitle">{subtitle}</span> : null}
      </div>
      {actions ? <div className="card-actions">{actions}</div> : null}
    </div>
  );
}

export function CardBody({ children, tight, flush, className }: { children: ReactNode; tight?: boolean; flush?: boolean; className?: string }) {
  return <div className={cx('card-body', tight && 'card-body--tight', flush && 'card-body--flush', className)}>{children}</div>;
}

export function CardFooter({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('card-footer', className)}>{children}</div>;
}

// --------------------------------------------------------------- Stat card
type Tone = 'brand' | 'success' | 'warn' | 'info' | 'danger' | 'violet';

interface StatCardProps {
  label: ReactNode;
  value: ReactNode;
  icon: IconName;
  tone?: Tone;
  delta?: number;
  foot?: ReactNode;
  onClick?: () => void;
}

export function StatCard({ label, value, icon, tone = 'brand', delta, foot, onClick }: StatCardProps) {
  const iconClass =
    tone === 'success' ? 'is-success' : tone === 'warn' ? 'is-warn' : tone === 'info' ? 'is-info' : '';
  return (
    <button className="stat-card" type="button" onClick={onClick} disabled={!onClick}>
      <div className="stat-head">
        <span className={cx('stat-icon', iconClass)}>
          <Icon name={icon} size={16} />
        </span>
        <span className="stat-label">{label}</span>
      </div>
      <div className="stat-row">
        <span className="stat-value">{value}</span>
        {typeof delta === 'number' ? (
          <span className={cx('stat-delta', delta >= 0 ? 'is-up' : 'is-down')}>
            <Icon name={delta >= 0 ? 'trendingUp' : 'trendingDown'} size={13} />
            {delta >= 0 ? '+' : ''}
            {delta.toFixed(1)}%
          </span>
        ) : null}
      </div>
      {foot ? <span className="stat-foot">{foot}</span> : null}
    </button>
  );
}

// ----------------------------------------------------------------- Badge
interface BadgeProps {
  tone?: Tone | 'neutral';
  children: ReactNode;
  dot?: boolean;
  className?: string;
}

export function Badge({ tone = 'neutral', children, dot, className }: BadgeProps) {
  return (
    <span className={cx('badge', tone !== 'neutral' && `badge--${tone}`, dot && 'badge--dot', className)}>
      {dot ? <span className="status-dot" /> : null}
      {children}
    </span>
  );
}

export function Tag({ children }: { children: ReactNode }) {
  return <span className="tag">{children}</span>;
}

// ---------------------------------------------------------------- Avatar
export function Avatar({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' | 'lg' }) {
  const initials = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
  return <span className={cx('avatar', size !== 'md' && `avatar--${size}`)}>{initials || '??'}</span>;
}

// --------------------------------------------------------------- Progress
export function Progress({ value, tone = 'brand' }: { value: number; tone?: 'brand' | 'success' | 'warn' | 'danger' }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className="progress" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
      <div className={cx('progress__bar', tone !== 'brand' && `progress__bar--${tone}`)} style={{ width: `${pct}%` }} />
    </div>
  );
}

// ----------------------------------------------------------------- Thumb
export function Thumb({ label, accent, size = 'md' }: { label: string; accent: string; size?: 'md' | 'lg' | 'xl' }) {
  const monogram = label
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
  const style: CSSProperties = { background: `linear-gradient(145deg, ${accent}, ${accent}cc)` };
  return (
    <span className={cx('thumb', size !== 'md' && `thumb--${size}`)} style={style}>
      <span className="thumb__monogram">{monogram || '·'}</span>
      <span className="thumb__ring" />
    </span>
  );
}

// ------------------------------------------------------------ Empty state
export function EmptyState({ icon = 'package', title, text, action }: { icon?: IconName; title: ReactNode; text?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty-state">
      <span className="empty-icon">
        <Icon name={icon} size={22} />
      </span>
      <span className="empty-title">{title}</span>
      {text ? <span className="empty-text">{text}</span> : null}
      {action}
    </div>
  );
}

// ----------------------------------------------------------------- Alert
export function Alert({ tone = 'info', title, children }: { tone?: 'info' | 'success' | 'warn' | 'danger'; title?: ReactNode; children?: ReactNode }) {
  const icon: IconName = tone === 'success' ? 'checkCircle' : tone === 'danger' ? 'xCircle' : tone === 'warn' ? 'alert' : 'info';
  return (
    <div className={cx('alert', `alert--${tone}`)}>
      <Icon name={icon} size={16} />
      <div className="stack grow">
        {title ? <span className="alert-title">{title}</span> : null}
        {children ? <span className="alert-body">{children}</span> : null}
      </div>
    </div>
  );
}

// ------------------------------------------------------------- Key/value
export function KeyValue({ rows }: { rows: Array<{ key: ReactNode; value: ReactNode }> }) {
  return (
    <div className="kv">
      {rows.map((row, index) => (
        <div className="kv-row" key={index}>
          <span className="kv-key">{row.key}</span>
          <span className="kv-value">{row.value}</span>
        </div>
      ))}
    </div>
  );
}
