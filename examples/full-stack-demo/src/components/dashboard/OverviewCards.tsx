import type { ActivityItem, ChannelStat, OrderStatus, Product, ProductPerformance, SeriesPoint, StatusStat } from '../../data/types';
import type { OrderRow } from '../../lib/dto';
import { CHANNEL_COLORS } from '../../lib/dto';
import {
  cx,
  formatCompactCurrency,
  formatCurrency,
  formatNumber,
  formatPercent,
  relativeTime,
  titleCase,
} from '../../lib/utils';
import { Badge, Card, CardBody, CardHeader, EmptyState, Progress, Thumb } from '../ui/Display';
import { Segmented } from '../ui/Nav';
import { Donut, LineAreaChart, type ChartDatum, type DonutSlice } from '../charts/Charts';

const STATUS_HEX: Record<OrderStatus, string> = {
  processing: '#1d4ed8',
  shipped: '#4f46e5',
  delivered: '#15803d',
  cancelled: '#dc2626',
};

const STATUS_PROGRESS: Record<OrderStatus, 'brand' | 'success' | 'warn' | 'danger'> = {
  processing: 'brand',
  shipped: 'brand',
  delivered: 'success',
  cancelled: 'danger',
};

export function SalesTrendCard({
  series,
  currency,
  range,
  onRangeChange,
}: {
  series: SeriesPoint[];
  currency: string;
  range: string;
  onRangeChange: (range: '7d' | '30d' | '90d') => void;
}) {
  const data: ChartDatum[] = series.map((point) => ({ label: point.label, value: point.revenue }));
  const total = series.reduce((sum, point) => sum + point.revenue, 0);
  const orders = series.reduce((sum, point) => sum + point.orders, 0);
  const step = series.length > 1 && range === '90d' ? 'Weekly' : 'Daily';

  return (
    <Card>
      <CardHeader
        title="Revenue trend"
        subtitle={`${step} buckets · ${series.length} points`}
        actions={
          <Segmented
            ariaLabel="Select date range"
            value={range}
            onChange={(value) => onRangeChange(value as '7d' | '30d' | '90d')}
            items={[
              { key: '7d', label: '7 days' },
              { key: '30d', label: '30 days' },
              { key: '90d', label: '90 days' },
            ]}
          />
        }
      />
      <CardBody>
        {data.length > 0 ? <LineAreaChart data={data} valueFormat={(value) => formatCompactCurrency(value, currency)} ariaLabel="Revenue over time" /> : <EmptyState icon="chart" title="No revenue in this range" text="Try a wider date range." />}
      </CardBody>
      <div className="card-footer">
        <span className="muted">
          Total <strong>{formatCurrency(total, currency)}</strong>
        </span>
        <span className="spacer" />
        <span className="dim">{formatNumber(orders)} orders in range</span>
      </div>
    </Card>
  );
}

export function ChannelMixCard({ channels, currency }: { channels: ChannelStat[]; currency: string }) {
  const slices: DonutSlice[] = channels.map((channel) => ({
    label: channel.label,
    value: channel.revenue,
    color: CHANNEL_COLORS[channel.channel] ?? 'var(--brand)',
  }));
  const total = channels.reduce((sum, channel) => sum + channel.revenue, 0);

  return (
    <Card>
      <CardHeader title="Channel mix" subtitle="Revenue share by sales channel" />
      <CardBody>
        {total > 0 ? (
          <Donut slices={slices} centerLabel="Revenue" centerValue={formatCompactCurrency(total, currency)} valueFormat={(value) => formatCurrency(value, currency)} />
        ) : (
          <EmptyState icon="chart" title="No channel revenue yet" text="Place a demo order to populate this chart." />
        )}
      </CardBody>
    </Card>
  );
}

export function OrderStatusCard({ statuses }: { statuses: StatusStat[] }) {
  const total = statuses.reduce((sum, status) => sum + status.count, 0);
  return (
    <Card>
      <CardHeader title="Order status" subtitle="Distribution of orders in range" />
      <CardBody>
        <div className="stack stack--gap-sm">
          {statuses.map((status) => (
            <div className="meter-row" key={status.status}>
              <div className="meter-head">
                <span className="row row--gap">
                  <span className="legend-swatch" style={{ background: STATUS_HEX[status.status] }} />
                  {status.label}
                </span>
                <span>
                  <strong>{formatNumber(status.count)}</strong> <span className="dim">· {formatPercent(status.share)}</span>
                </span>
              </div>
              <Progress value={status.share} tone={STATUS_PROGRESS[status.status]} />
            </div>
          ))}
          {total === 0 ? <span className="dim">No orders in this range.</span> : null}
        </div>
      </CardBody>
    </Card>
  );
}

export function TopProductsCard({ products, currency }: { products: ProductPerformance[]; currency: string }) {
  return (
    <Card>
      <CardHeader title="Top products" subtitle="By merchandise revenue" />
      <CardBody tight>
        {products.length === 0 ? (
          <EmptyState icon="box" title="No product sales yet" text="Product performance appears once orders are placed." />
        ) : (
          <div className="feed">
            {products.map((product, index) => (
              <div className="feed-item" key={product.productId}>
                <span className="scenario-index">{index + 1}</span>
                <div className="stack grow" style={{ gap: 2 }}>
                  <span className="feed-title">{product.name}</span>
                  <span className="feed-detail">
                    {product.sku} · {formatNumber(product.units)} units · {product.margin.toFixed(1)}% margin
                  </span>
                </div>
                <span className="strong nowrap">{formatCurrency(product.revenue, currency)}</span>
              </div>
            ))}
          </div>
        )}
      </CardBody>
    </Card>
  );
}

export function LowStockCard({ products, onViewProducts }: { products: Product[]; onViewProducts: () => void }) {
  return (
    <Card>
      <CardHeader
        title="Low stock"
        subtitle={products.length === 0 ? 'Everything is above its reorder point' : `${products.length} product${products.length === 1 ? '' : 's'} need attention`}
        actions={
          <button className="link" type="button" onClick={onViewProducts}>
            Manage
          </button>
        }
      />
      <CardBody tight>
        {products.length === 0 ? (
          <EmptyState icon="checkCircle" title="Stock is healthy" text="No active product is at or below its reorder point." />
        ) : (
          <div className="feed">
            {products.slice(0, 6).map((product) => (
              <div className="feed-item" key={product.id}>
                <Thumb label={product.name} accent={product.accent} />
                <div className="stack grow" style={{ gap: 2 }}>
                  <span className="feed-title">{product.name}</span>
                  <span className="feed-detail">
                    {product.sku} · reorder at {formatNumber(product.reorderPoint)}
                  </span>
                </div>
                <Badge tone={product.stock === 0 ? 'danger' : 'warn'} dot>
                  {formatNumber(product.stock)} left
                </Badge>
              </div>
            ))}
          </div>
        )}
      </CardBody>
    </Card>
  );
}

export function RecentOrdersCard({ orders, currency, onOpen, onViewAll }: { orders: OrderRow[]; currency: string; onOpen?: (id: string) => void; onViewAll?: () => void }) {
  return (
    <Card>
      <CardHeader
        title="Recent orders"
        subtitle="Newest first"
        actions={
          onViewAll ? (
            <button className="link" type="button" onClick={onViewAll}>
              View all
            </button>
          ) : null
        }
      />
      <CardBody tight>
        {orders.length === 0 ? (
          <EmptyState icon="receipt" title="No orders yet" text="Place an order from the storefront to see it here." />
        ) : (
          <div className="feed">
            {orders.map((order) => (
              <button
                className="feed-item"
                type="button"
                key={order.id}
                onClick={onOpen ? () => onOpen(order.id) : undefined}
                style={{ background: 'none', border: 0, textAlign: 'left', width: '100%', cursor: onOpen ? 'pointer' : 'default' }}
              >
                <span className="feed-marker is-order">
                  <span className="mono">{order.id.replace('NS-', '#')}</span>
                </span>
                <div className="stack grow" style={{ gap: 2 }}>
                  <span className="feed-title">{order.customer?.name ?? 'Guest checkout'}</span>
                  <span className="feed-detail">
                    {order.items.length} item{order.items.length === 1 ? '' : 's'} · {titleCase(order.channel)}
                  </span>
                </div>
                <div className="stack" style={{ alignItems: 'flex-end', gap: 2 }}>
                  <span className="strong nowrap">{formatCurrency(order.total, currency)}</span>
                  <span className="feed-time">{relativeTime(order.createdAt)}</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </CardBody>
    </Card>
  );
}

export function ActivityFeedCard({ activity }: { activity: ActivityItem[] }) {
  const markerClass = (kind: ActivityItem['kind']) =>
    kind === 'order' ? 'is-order' : kind === 'stock' ? 'is-stock' : kind === 'customer' ? 'is-customer' : '';
  return (
    <Card>
      <CardHeader title="Activity" subtitle="Live operational feed" />
      <CardBody tight>
        {activity.length === 0 ? (
          <EmptyState icon="activity" title="No activity yet" />
        ) : (
          <div className="feed">
            {activity.map((item) => (
              <div className="feed-item" key={item.id}>
                <span className={cx('feed-marker', markerClass(item.kind))}>
                  <span style={{ fontSize: 11, fontWeight: 700 }}>{item.kind.slice(0, 1).toUpperCase()}</span>
                </span>
                <div className="stack grow" style={{ gap: 2 }}>
                  <span className="feed-title">{item.title}</span>
                  <span className="feed-detail">{item.detail}</span>
                </div>
                <span className="feed-time">{relativeTime(item.at)}</span>
              </div>
            ))}
          </div>
        )}
      </CardBody>
    </Card>
  );
}
