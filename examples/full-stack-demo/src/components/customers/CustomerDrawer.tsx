import { useApi } from '../../lib/hooks';
import type { CustomerDetail } from '../../lib/dto';
import { formatCurrency, formatDate, formatNumber } from '../../lib/utils';
import { Drawer } from '../ui/Overlay';
import { Avatar, Badge, Card, EmptyState, KeyValue } from '../ui/Display';
import { ErrorState, LoadingState, Skeleton } from '../ui/Feedback';
import { SegmentBadge, OrderStatusBadge } from '../common/StatusBadge';

interface CustomerDrawerProps {
  customerId: string | null;
  currency: string;
  onClose: () => void;
  onOpenOrder?: (orderId: string) => void;
}

export function CustomerDrawer({ customerId, currency, onClose, onOpenOrder }: CustomerDrawerProps) {
  const { data, error, loading, reload } = useApi<CustomerDetail>(customerId ? `/api/customers/${customerId}` : null);
  const customer = data?.item ?? null;

  return (
    <Drawer open={Boolean(customerId)} onClose={onClose} title={customer?.name ?? 'Customer'} subtitle={customer?.email} size="wide">
      {loading ? (
        <div className="stack stack--gap">
          <Skeleton variant="card" />
          <LoadingState label="Loading customer…" />
        </div>
      ) : error ? (
        <ErrorState message={error.message} onRetry={reload} />
      ) : !data || !customer ? (
        <EmptyState icon="users" title="Customer not found" />
      ) : (
        <>
          <div className="row row--gap">
            <Avatar name={customer.name} size="lg" />
            <div className="stack" style={{ gap: 4 }}>
              <span className="strong" style={{ fontSize: 16 }}>
                {customer.name}
              </span>
              <span className="dim">{customer.email}</span>
              <div className="row row--gap">
                <SegmentBadge segment={customer.segment} />
                {customer.company ? <Badge tone="info">{customer.company}</Badge> : null}
              </div>
            </div>
          </div>

          <div className="grid grid--3">
            <Card>
              <div className="card-body">
                <span className="stat-label">Orders</span>
                <div className="stat-value">{formatNumber(data.metrics.orders)}</div>
              </div>
            </Card>
            <Card>
              <div className="card-body">
                <span className="stat-label">Lifetime value</span>
                <div className="stat-value" style={{ fontSize: 20 }}>
                  {formatCurrency(data.metrics.lifetimeValue, currency)}
                </div>
              </div>
            </Card>
            <Card>
              <div className="card-body">
                <span className="stat-label">Avg. order</span>
                <div className="stat-value" style={{ fontSize: 20 }}>
                  {formatCurrency(data.metrics.averageOrderValue, currency)}
                </div>
              </div>
            </Card>
          </div>

          <Card>
            <div className="card-header">
              <span className="card-title">Profile</span>
            </div>
            <div className="card-body">
              <KeyValue
                rows={[
                  { key: 'Phone', value: customer.phone || '—' },
                  { key: 'Customer since', value: formatDate(customer.joinedAt) },
                  { key: 'Last order', value: data.metrics.lastOrderAt ? formatDate(data.metrics.lastOrderAt) : 'No orders yet' },
                  { key: 'Address', value: `${customer.address.line1}, ${customer.address.city}, ${customer.address.region} ${customer.address.postalCode}` },
                  { key: 'Country', value: customer.address.country },
                  { key: 'Notes', value: customer.notes || '—' },
                ]}
              />
            </div>
          </Card>

          <Card>
            <div className="card-header">
              <span className="card-title">Order history</span>
              <span className="card-subtitle">{data.orders.length} order{data.orders.length === 1 ? '' : 's'}</span>
            </div>
            <div className="card-body card-body--flush">
              {data.orders.length === 0 ? (
                <EmptyState icon="receipt" title="No orders yet" text="This customer has not placed an order." />
              ) : (
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Order</th>
                        <th>Placed</th>
                        <th className="right">Total</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.orders.map((order) => (
                        <tr
                          key={order.id}
                          onClick={onOpenOrder ? () => onOpenOrder(order.id) : undefined}
                          style={onOpenOrder ? { cursor: 'pointer' } : undefined}
                        >
                          <td className="mono">{order.id}</td>
                          <td>{formatDate(order.createdAt)}</td>
                          <td className="right strong">{formatCurrency(order.total, currency)}</td>
                          <td>
                            <OrderStatusBadge status={order.status} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </Card>
        </>
      )}
    </Drawer>
  );
}
