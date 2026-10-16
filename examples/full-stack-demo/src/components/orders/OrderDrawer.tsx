import { useState } from 'react';
import type { Order, OrderStatus } from '../../data/types';
import { ApiError, apiRequest } from '../../lib/api';
import { useApi } from '../../lib/hooks';
import { describeError, useToast } from '../../app/AppContext';
import type { OrderDetail } from '../../lib/dto';
import { cx, formatCurrency, formatDateTime, titleCase } from '../../lib/utils';
import { Drawer } from '../ui/Overlay';
import { Button } from '../ui/Button';
import { Alert, Avatar, Badge, Card, EmptyState, KeyValue } from '../ui/Display';
import { LoadingState, ErrorState } from '../ui/Feedback';
import { OrderStatusBadge } from '../common/StatusBadge';

const NEXT_STATUSES: OrderStatus[] = ['processing', 'shipped', 'delivered', 'cancelled'];

interface OrderDrawerProps {
  orderId: string | null;
  currency: string;
  onClose: () => void;
  onUpdated: (order: Order) => void;
}

/** Order detail drawer: fetches the full order and allows status transitions. */
export function OrderDrawer({ orderId, currency, onClose, onUpdated }: OrderDrawerProps) {
  const toast = useToast();
  const { data, error, loading, reload } = useApi<OrderDetail>(orderId ? `/api/orders/${orderId}` : null);
  const [busy, setBusy] = useState<OrderStatus | null>(null);

  async function changeStatus(status: OrderStatus) {
    if (!data) return;
    setBusy(status);
    try {
      const result = await apiRequest<{ item: Order }>(`/api/orders/${data.item.id}`, { method: 'PATCH', body: { status } });
      toast({ tone: 'success', title: `Order ${result.item.id} → ${titleCase(status)}`, text: 'Status updated.' });
      onUpdated(result.item);
      reload();
    } catch (err) {
      const message = err instanceof ApiError && err.fieldIssues.length > 0 ? err.fieldIssues[0]!.message : describeError(err);
      toast({ tone: 'error', title: 'Status not changed', text: message });
    } finally {
      setBusy(null);
    }
  }

  const order = data?.item ?? null;

  return (
    <Drawer open={Boolean(orderId)} onClose={onClose} title={order ? `Order ${order.id}` : 'Order'} subtitle={order ? formatDateTime(order.createdAt) : undefined} size="wide">
      {loading ? (
        <LoadingState label="Loading order…" />
      ) : error ? (
        <ErrorState message={error.message} onRetry={reload} />
      ) : !data || !order ? (
        <EmptyState icon="receipt" title="Order not found" />
      ) : (
        <>
          <div className="row row--between row--gap">
            <OrderStatusBadge status={order.status} />
            <span className="strong" style={{ fontSize: 18 }}>
              {formatCurrency(order.total, currency)}
            </span>
          </div>

          <Card>
            <div className="card-header">
              <span className="card-title">Update status</span>
            </div>
            <div className="card-body row row--gap row--wrap">
              {NEXT_STATUSES.filter((status) => status !== order.status).map((status) => (
                <Button
                  key={status}
                  size="sm"
                  variant={status === 'cancelled' ? 'danger-ghost' : 'secondary'}
                  loading={busy === status}
                  disabled={busy !== null}
                  onClick={() => changeStatus(status)}
                >
                  Mark {titleCase(status)}
                </Button>
              ))}
              <span className="dim" style={{ fontSize: 12 }}>
                Current: {titleCase(order.status)}
              </span>
            </div>
          </Card>

          <Card>
            <div className="card-header">
              <span className="card-title">Line items</span>
              <span className="card-subtitle">{order.items.length} product{order.items.length === 1 ? '' : 's'}</span>
            </div>
            <div className="card-body card-body--flush">
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th className="right">Qty</th>
                      <th className="right">Unit</th>
                      <th className="right">Line total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {order.items.map((item) => (
                      <tr key={item.productId}>
                        <td>
                          <div className="cell-stack">
                            <span className="row-primary">{item.name}</span>
                            <span className="cell-sub mono">{item.sku}</span>
                          </div>
                        </td>
                        <td className="right">{item.qty}</td>
                        <td className="right">{formatCurrency(item.unitPrice, currency)}</td>
                        <td className="right strong">{formatCurrency(item.unitPrice * item.qty, currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="card-footer" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
              <div className="cart-summary">
                <div className="cart-summary-row">
                  <span className="label">Subtotal</span>
                  <span>{formatCurrency(order.subtotal, currency)}</span>
                </div>
                <div className="cart-summary-row">
                  <span className="label">Shipping</span>
                  <span>{order.shipping === 0 ? 'Free' : formatCurrency(order.shipping, currency)}</span>
                </div>
                <div className="cart-summary-row">
                  <span className="label">Tax</span>
                  <span>{formatCurrency(order.tax, currency)}</span>
                </div>
                <div className="cart-summary-row cart-summary-row--total">
                  <span>Total</span>
                  <span>{formatCurrency(order.total, currency)}</span>
                </div>
              </div>
            </div>
          </Card>

          <Card>
            <div className="card-header">
              <span className="card-title">Customer &amp; shipping</span>
            </div>
            <div className="card-body">
              <div className="row row--gap" style={{ marginBottom: 14 }}>
                <Avatar name={data.customer?.name ?? 'Guest'} size="lg" />
                <div className="stack" style={{ gap: 2 }}>
                  <span className="strong">{data.customer?.name ?? 'Guest checkout'}</span>
                  <span className="dim">{data.customer?.email ?? '—'}</span>
                  {data.customer ? <Badge tone="info">{data.customer.company || 'Individual'}</Badge> : null}
                </div>
              </div>
              <hr className="divider" />
              <div style={{ marginTop: 14 }}>
                <KeyValue
                  rows={[
                    { key: 'Ship to', value: order.shippingAddress.line1 },
                    { key: 'City', value: `${order.shippingAddress.city}, ${order.shippingAddress.region}` },
                    { key: 'Postal code', value: order.shippingAddress.postalCode },
                    { key: 'Country', value: order.shippingAddress.country },
                    { key: 'Payment', value: order.paymentMethod },
                    { key: 'Channel', value: titleCase(order.channel) },
                  ]}
                />
              </div>
            </div>
          </Card>

          <Card>
            <div className="card-header">
              <span className="card-title">History</span>
            </div>
            <div className="card-body">
              <div className="timeline">
                {order.events.map((event) => (
                  <div className="timeline-item" key={event.id}>
                    <span className={cx('timeline-dot', event.kind === 'success' ? 'is-success' : event.kind === 'warn' ? 'is-warn' : event.kind === 'error' ? 'is-error' : 'is-info')} />
                    <div className="stack" style={{ gap: 2 }}>
                      <span className="timeline-label">{event.label}</span>
                      <span className="timeline-detail">{event.detail}</span>
                      <span className="timeline-time">{formatDateTime(event.at)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Card>

          <Alert tone="info">
            Orders are stored in memory on the demo API. Restarting the server restores the seed dataset.
          </Alert>
        </>
      )}
    </Drawer>
  );
}
