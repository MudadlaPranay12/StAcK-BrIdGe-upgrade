import type { CustomerRow } from '../../lib/dto';
import { formatCurrency, formatDate, formatNumber } from '../../lib/utils';
import { Avatar } from '../ui/Display';
import { DataTable, type Column } from '../ui/Table';
import { SegmentBadge } from '../common/StatusBadge';

interface CustomerTableProps {
  customers: CustomerRow[];
  currency: string;
  loading?: boolean;
  onOpen: (customer: CustomerRow) => void;
  selectedId?: string | null;
}

export function CustomerTable({ customers, currency, loading, onOpen, selectedId }: CustomerTableProps) {
  const columns: Array<Column<CustomerRow>> = [
    {
      key: 'name',
      header: 'Customer',
      render: (customer) => (
        <div className="cell-inline">
          <Avatar name={customer.name} />
          <div className="cell-stack">
            <span className="row-primary">{customer.name}</span>
            <span className="cell-sub">{customer.email}</span>
          </div>
        </div>
      ),
    },
    {
      key: 'company',
      header: 'Company',
      render: (customer) => customer.company || '—',
    },
    {
      key: 'segment',
      header: 'Segment',
      render: (customer) => <SegmentBadge segment={customer.segment} />,
    },
    {
      key: 'orders',
      header: 'Orders',
      align: 'right',
      render: (customer) => <span className="nowrap">{formatNumber(customer.metrics.orders)}</span>,
    },
    {
      key: 'ltv',
      header: 'Lifetime value',
      align: 'right',
      render: (customer) => <span className="nowrap strong">{formatCurrency(customer.metrics.lifetimeValue, currency)}</span>,
    },
    {
      key: 'joinedAt',
      header: 'Customer since',
      render: (customer) => <span className="nowrap">{formatDate(customer.joinedAt)}</span>,
    },
  ];

  return <DataTable columns={columns} rows={customers} rowKey={(customer) => customer.id} loading={loading} onRowClick={onOpen} selectedKey={selectedId ?? null} />;
}
