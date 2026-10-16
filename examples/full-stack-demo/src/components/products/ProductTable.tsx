import type { Category, Product } from '../../data/types';
import { formatCurrency, formatNumber } from '../../lib/utils';
import { Badge, Thumb } from '../ui/Display';
import { DataTable, type Column } from '../ui/Table';
import { IconButton } from '../ui/Button';
import { ProductStatusBadge } from '../common/StatusBadge';

interface ProductTableProps {
  products: Product[];
  categoriesById: Record<string, Category>;
  currency: string;
  loading?: boolean;
  sort: { key: string; dir: 'asc' | 'desc' } | null;
  onSort: (key: string) => void;
  onEdit: (product: Product) => void;
  onAdjustStock: (product: Product) => void;
  onDelete: (product: Product) => void;
  selectedId?: string | null;
}

export function ProductTable({ products, categoriesById, currency, loading, sort, onSort, onEdit, onAdjustStock, onDelete, selectedId }: ProductTableProps) {
  const columns: Array<Column<Product>> = [
    {
      key: 'name',
      header: 'Product',
      sortable: true,
      render: (product) => (
        <div className="cell-inline">
          <Thumb label={product.name} accent={product.accent} />
          <div className="cell-stack">
            <span className="row-primary">{product.name}</span>
            <span className="cell-sub mono">{product.sku}</span>
          </div>
        </div>
      ),
    },
    {
      key: 'categoryId',
      header: 'Category',
      render: (product) => categoriesById[product.categoryId]?.name ?? '—',
    },
    {
      key: 'price',
      header: 'Price',
      sortable: true,
      align: 'right',
      render: (product) => <span className="nowrap">{formatCurrency(product.price, currency)}</span>,
    },
    {
      key: 'stock',
      header: 'Stock',
      sortable: true,
      align: 'right',
      render: (product) => {
        const low = product.stock <= product.reorderPoint;
        return (
          <Badge tone={product.stock === 0 ? 'danger' : low ? 'warn' : 'success'} dot>
            {formatNumber(product.stock)}
          </Badge>
        );
      },
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      render: (product) => <ProductStatusBadge status={product.status} />,
    },
    {
      key: 'rating',
      header: 'Rating',
      sortable: true,
      align: 'right',
      render: (product) => <span className="nowrap">{product.rating.toFixed(1)} ★</span>,
    },
    {
      key: 'unitsSold',
      header: 'Sold',
      sortable: true,
      align: 'right',
      render: (product) => <span className="nowrap">{formatNumber(product.unitsSold)}</span>,
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      width: '132px',
      render: (product) => (
        <div className="table-actions">
          <IconButton icon="edit" label={`Edit ${product.name}`} variant="plain" size="sm" onClick={() => onEdit(product)} />
          <IconButton icon="package" label={`Adjust stock for ${product.name}`} variant="plain" size="sm" onClick={() => onAdjustStock(product)} />
          <IconButton icon="trash" label={`Archive ${product.name}`} variant="danger" size="sm" onClick={() => onDelete(product)} />
        </div>
      ),
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={products}
      rowKey={(product) => product.id}
      loading={loading}
      sort={sort}
      onSort={onSort}
      onRowClick={onEdit}
      selectedKey={selectedId ?? null}
    />
  );
}
