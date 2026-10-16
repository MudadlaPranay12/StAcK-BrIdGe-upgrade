import { type ReactNode } from 'react';
import { cx } from '../../lib/utils';
import { Icon } from './Icon';
import { EmptyState } from './Display';

export interface Column<T> {
  key: string;
  header: ReactNode;
  sortable?: boolean;
  align?: 'left' | 'right';
  width?: string;
  render: (row: T) => ReactNode;
}

interface DataTableProps<T> {
  columns: Array<Column<T>>;
  rows: T[];
  rowKey: (row: T) => string;
  loading?: boolean;
  empty?: ReactNode;
  sort?: { key: string; dir: 'asc' | 'desc' } | null;
  onSort?: (key: string) => void;
  onRowClick?: (row: T) => void;
  selectedKey?: string | null;
  skeletonRows?: number;
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  loading,
  empty,
  sort,
  onSort,
  onRowClick,
  selectedKey,
  skeletonRows = 6,
}: DataTableProps<T>) {
  if (loading && rows.length === 0) {
    return (
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column.key} className={column.align === 'right' ? 'right' : undefined} style={column.width ? { width: column.width } : undefined}>
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: skeletonRows }).map((_, rowIndex) => (
              <tr key={rowIndex}>
                {columns.map((column) => (
                  <td key={column.key}>
                    <span className="skeleton skeleton--text" style={{ width: '70%' }} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (!loading && rows.length === 0) {
    return <>{empty ?? <EmptyState title="Nothing here yet" text="No records match the current filters." />}</>;
  }

  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key} className={column.align === 'right' ? 'right' : undefined} style={column.width ? { width: column.width } : undefined}>
                {column.sortable && onSort ? (
                  <SortButton label={column.header} active={sort?.key === column.key} dir={sort?.key === column.key ? sort.dir : undefined} onClick={() => onSort(column.key)} />
                ) : (
                  column.header
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const key = rowKey(row);
            return (
              <tr
                key={key}
                className={cx(selectedKey === key && 'is-selected', onRowClick && 'is-clickable')}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
              >
                {columns.map((column) => (
                  <td key={column.key} className={column.align === 'right' ? 'right' : undefined}>
                    {column.render(row)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function SortButton({ label, active, dir, onClick }: { label: ReactNode; active?: boolean; dir?: 'asc' | 'desc'; onClick: () => void }) {
  return (
    <button className="sort-btn" type="button" onClick={onClick} style={active ? { color: 'var(--brand)' } : undefined}>
      {label}
      <span className="sort-arrow">{active ? (dir === 'desc' ? '▼' : '▲') : '↕'}</span>
    </button>
  );
}

export function Pagination({
  page,
  pageCount,
  total,
  pageSize,
  onPage,
}: {
  page: number;
  pageCount: number;
  total: number;
  pageSize: number;
  onPage: (page: number) => void;
}) {
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(total, page * pageSize);
  const pages: number[] = [];
  for (let index = 1; index <= pageCount; index++) {
    if (index === 1 || index === pageCount || Math.abs(index - page) <= 1) pages.push(index);
  }
  const unique = Array.from(new Set(pages));

  return (
    <div className="row row--between row--gap" style={{ width: '100%' }}>
      <span className="dim">
        Showing <strong>{start}</strong>–<strong>{end}</strong> of <strong>{total}</strong>
      </span>
      <div className="pagination">
        <button className="page-btn" type="button" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page">
          <Icon name="chevronLeft" size={14} />
        </button>
        {unique.map((index, position) => {
          const previous = unique[position - 1];
          const gap = previous !== undefined && index - previous > 1;
          return (
            <span key={index} className="row" style={{ gap: 4 }}>
              {gap ? <span className="dim">…</span> : null}
              <button className={cx('page-btn', index === page && 'is-active')} type="button" onClick={() => onPage(index)}>
                {index}
              </button>
            </span>
          );
        })}
        <button className="page-btn" type="button" disabled={page >= pageCount} onClick={() => onPage(page + 1)} aria-label="Next page">
          <Icon name="chevronRight" size={14} />
        </button>
      </div>
    </div>
  );
}
