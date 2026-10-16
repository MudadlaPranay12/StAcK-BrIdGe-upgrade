import type { OrderRow } from '../../lib/dto';
import { ChannelLabel, OrderStatusBadge } from '../common/StatusBadge';
import { formatCurrency, formatDateTime } from '../../lib/utils';
import { Avatar } from '../ui/Display';
import { DataTable, type Column } from '../ui/Table';

interface OrderTableProps {
  orders: OrderRow[];
  currency: string;
  loading?: boolean;
  onOpen: (order: OrderRow) => void;
  selectedId?: string | null;
}

export function OrderTable({ orders, currency, loading, onOpen, selectedId }: OrderTableProps) {
  const columns: Array<Column<OrderRow>> = [
    {
      key: 'id',
      header: 'Order',
      render: (order) => <span className="row-primary mono">{order.id}</span>,
    },
    {
      key: 'customer',
      header: 'Customer',
      render: (order) => (
        <div className="cell-inline">
          <Avatar name={order.customer?.name ?? 'Guest'} size="sm" />
          <div className="cell-stack">
            <span className="row-primary">{order.customer?.name ?? 'Guest checkout'}</span>
            <span className="cell-sub">{order.customer?.email ?? '—'}</span>
          </div>
        </div>
      ),
    },
    {
      key: 'createdAt',
      header: 'Placed',
      render: (order) => <span className="nowrap">{formatDateTime(order.createdAt)}</span>,
    },
    {
      key: 'channel',
      header: 'Channel',
      render: (order) => <ChannelLabel channel={order.channel} />,
    },
    {
      key: 'items',
      header: 'Items',
      align: 'right',
      render: (order) => <span className="nowrap">{order.items.reduce((sum, item) => sum + item.qty, 0)}</span>,
    },
    {
      key: 'total',
      header: 'Total',
      align: 'right',
      render: (order) => <span className="nowrap strong">{formatCurrency(order.total, currency)}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (order) => <OrderStatusBadge status={order.status} />,
    },
  ];

  return <DataTable columns={columns} rows={orders} rowKey={(order) => order.id} loading={loading} onRowClick={onOpen} selectedKey={selectedId ?? null} />;
}
