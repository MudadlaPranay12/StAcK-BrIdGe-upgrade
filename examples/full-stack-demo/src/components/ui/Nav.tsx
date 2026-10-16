import { type ReactNode } from 'react';
import { cx } from '../../lib/utils';

export interface TabItem {
  key: string;
  label: ReactNode;
  count?: number;
}

export function Tabs({ items, active, onChange }: { items: TabItem[]; active: string; onChange: (key: string) => void }) {
  return (
    <div className="tabs" role="tablist">
      {items.map((item) => (
        <button
          key={item.key}
          className={cx('tab', active === item.key && 'is-active')}
          type="button"
          role="tab"
          aria-selected={active === item.key}
          onClick={() => onChange(item.key)}
        >
          {item.label}
          {typeof item.count === 'number' ? <span className="nav-count" style={{ marginLeft: 6 }}>{item.count}</span> : null}
        </button>
      ))}
    </div>
  );
}

export interface SegmentItem {
  key: string;
  label: ReactNode;
}

export function Segmented({ items, value, onChange, ariaLabel }: { items: SegmentItem[]; value: string; onChange: (key: string) => void; ariaLabel?: string }) {
  return (
    <div className="segmented" role="group" aria-label={ariaLabel}>
      {items.map((item) => (
        <button
          key={item.key}
          className={cx('segment', value === item.key && 'is-active')}
          type="button"
          aria-pressed={value === item.key}
          onClick={() => onChange(item.key)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

export interface ChipItem {
  key: string;
  label: ReactNode;
}

export function ChipRow({ items, value, onChange }: { items: ChipItem[]; value: string; onChange: (key: string) => void }) {
  return (
    <div className="chip-row">
      {items.map((item) => (
        <button key={item.key} className={cx('chip', value === item.key && 'is-active')} type="button" onClick={() => onChange(item.key)}>
          {item.label}
        </button>
      ))}
    </div>
  );
}

export interface Crumb {
  label: ReactNode;
  to?: string;
}

export function Breadcrumbs({ items, onNavigate }: { items: Crumb[]; onNavigate: (to: string) => void }) {
  return (
    <nav className="breadcrumbs" aria-label="Breadcrumb">
      {items.map((item, index) => (
        <span key={index} className="row" style={{ gap: 6 }}>
          {index > 0 ? <span>/</span> : null}
          {item.to ? (
            <button type="button" onClick={() => onNavigate(item.to as string)}>
              {item.label}
            </button>
          ) : (
            <span>{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
