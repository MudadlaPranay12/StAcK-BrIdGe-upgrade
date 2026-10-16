import { useMemo, useState } from 'react';
import type { RangeKey } from '../data/types';
import type { AnalyticsData } from '../lib/dto';
import { CHANNEL_COLORS } from '../lib/dto';
import { useApi, useDocumentTitle } from '../lib/hooks';
import { useRouter } from '../lib/router';
import {
  formatCompactCurrency,
  formatCurrency,
  formatNumber,
  formatPercent,
} from '../lib/utils';
import { PageHeader } from '../components/layout/PageHeader';
import { MetricGrid } from '../components/dashboard/MetricGrid';
import { OrderStatusCard } from '../components/dashboard/OverviewCards';
import { BarChart, Donut, LineAreaChart, type ChartDatum, type DonutSlice } from '../components/charts/Charts';
import { Badge, Card, CardBody, CardHeader, EmptyState } from '../components/ui/Display';
import { DataTable, type Column } from '../components/ui/Table';
import { Segmented } from '../components/ui/Nav';
import { ErrorState, LoadingState } from '../components/ui/Feedback';
import type { ProductPerformance } from '../data/types';

type SortKey = 'revenue' | 'units' | 'margin';

const RANGE_LABEL: Record<RangeKey, string> = { '7d': 'last 7 days', '30d': 'last 30 days', '90d': 'last 90 days' };
const RANGE_OPTIONS = [
  { key: '7d', label: '7 days' },
  { key: '30d', label: '30 days' },
  { key: '90d', label: '90 days' },
];

const SORT_OPTIONS = [
  { key: 'revenue', label: 'Revenue' },
  { key: 'units', label: 'Units' },
  { key: 'margin', label: 'Margin' },
];

/** Full-width revenue trend across the selected range. */
function RevenueTrendCard({ series, currency, range }: { series: AnalyticsData['series']; currency: string; range: RangeKey }) {
  const data: ChartDatum[] = series.map((point) => ({ label: point.label, value: point.revenue }));
  const total = series.reduce((sum, point) => sum + point.revenue, 0);

  return (
    <Card>
      <CardHeader title="Revenue trend" subtitle={`${series.length} points · ${RANGE_LABEL[range]}`} />
      <CardBody>
        {data.length > 0 ? (
          <LineAreaChart data={data} valueFormat={(value) => formatCompactCurrency(value, currency)} ariaLabel="Revenue over the selected range" />
        ) : (
          <EmptyState icon="chart" title="No revenue in this range" text="Widen the date range to populate the trend." />
        )}
      </CardBody>
      <div className="card-footer">
        <span className="muted">
          Range total <strong>{formatCurrency(total, currency)}</strong>
        </span>
        <span className="spacer" />
        <span className="dim">{formatNumber(series.reduce((sum, point) => sum + point.orders, 0))} orders</span>
      </div>
    </Card>
  );
}

/** Order-count bars for the same buckets as the revenue trend. */
function OrderVolumeCard({ series, range }: { series: AnalyticsData['series']; range: RangeKey }) {
  const data: ChartDatum[] = series.map((point) => ({ label: point.label, value: point.orders }));
  const total = series.reduce((sum, point) => sum + point.orders, 0);

  return (
    <Card>
      <CardHeader title="Order volume" subtitle={`Orders per bucket · ${RANGE_LABEL[range]}`} />
      <CardBody>
        {data.length > 0 ? <BarChart data={data} /> : <EmptyState icon="receipt" title="No orders in this range" />}
      </CardBody>
      <div className="card-footer">
        <span className="muted">
          <strong>{formatNumber(total)}</strong> orders in range
        </span>
      </div>
    </Card>
  );
}

/** Revenue share per sales channel, colour-matched to the legend. */
function ChannelRevenueCard({ channels, currency }: { channels: AnalyticsData['channels']; currency: string }) {
  const slices: DonutSlice[] = channels.map((channel) => ({
    label: channel.label,
    value: channel.revenue,
    color: CHANNEL_COLORS[channel.channel] ?? 'var(--brand)',
  }));
  const total = channels.reduce((sum, channel) => sum + channel.revenue, 0);

  return (
    <Card>
      <CardHeader title="Channel revenue" subtitle="Every channel the store sells through" />
      <CardBody>
        {total > 0 ? (
          <Donut slices={slices} centerLabel="Revenue" centerValue={formatCompactCurrency(total, currency)} valueFormat={(value) => formatCurrency(value, currency)} />
        ) : (
          <EmptyState icon="chart" title="No channel revenue yet" text="Place a demo order to populate this breakdown." />
        )}
      </CardBody>
    </Card>
  );
}

/** Explains why the charts and the table can never disagree. */
function CoherenceCard({ orders, currency }: { orders: number; currency: string }) {
  return (
    <Card>
      <CardHeader title="How these numbers are produced" subtitle="One source of truth" />
      <CardBody>
        <div className="stack stack--gap-sm">
          <p className="muted">
            The KPIs, both charts and the product table are all derived on the server from the same
            in-range order set — <strong>{formatNumber(orders)} orders</strong> — so they stay internally consistent.
          </p>
          <span className="muted">• Revenue is the sum of non-cancelled order totals in the range.</span>
          <span className="muted">• Units come from order line items, and margins use each product&apos;s stored cost.</span>
          <span className="muted">• Conversion compares in-range orders to recorded storefront sessions.</span>
          <span className="muted">
            • Changing the range re-requests <span className="mono">/api/analytics</span>, so every panel updates together.
          </span>
          <span className="dim">
            Currency is reported in {currency}. Values are rounded for display only; the server sends full precision.
          </span>
        </div>
      </CardBody>
    </Card>
  );
}

export function AnalyticsPage() {
  useDocumentTitle('Analytics — Northstar Commerce');
  const { navigate } = useRouter();
  const [range, setRange] = useState<RangeKey>('30d');
  const [sortKey, setSortKey] = useState<SortKey>('revenue');
  const { data, error, loading, reload } = useApi<AnalyticsData>(`/api/analytics?range=${range}`);

  const products = useMemo(() => {
    const rows = data ? [...data.products] : [];
    rows.sort((a, b) => (sortKey === 'margin' ? b.margin - a.margin : sortKey === 'units' ? b.units - a.units : b.revenue - a.revenue));
    return rows.slice(0, 20);
  }, [data, sortKey]);

  if (error) {
    return (
      <div className="page">
        <PageHeader eyebrow="Analytics" title="Performance analytics" subtitle="Trends, channels and product performance." />
        <ErrorState message={error.message} onRetry={reload} />
      </div>
    );
  }

  if (loading || !data) {
    return (
      <div className="page">
        <PageHeader eyebrow="Analytics" title="Performance analytics" subtitle="Trends, channels and product performance." />
        <LoadingState label="Crunching the numbers…" />
      </div>
    );
  }

  const columns: Array<Column<ProductPerformance>> = [
    {
      key: 'name',
      header: 'Product',
      render: (row) => (
        <div className="stack" style={{ gap: 2 }}>
          <span className="strong">{row.name}</span>
          <span className="dim mono">{row.sku}</span>
        </div>
      ),
    },
    { key: 'units', header: 'Units', align: 'right', sortable: true, render: (row) => formatNumber(row.units) },
    { key: 'revenue', header: 'Revenue', align: 'right', sortable: true, render: (row) => <span className="strong">{formatCurrency(row.revenue, data.currency)}</span> },
    {
      key: 'margin',
      header: 'Margin',
      align: 'right',
      sortable: true,
      render: (row) => (
        <Badge tone={row.margin >= 50 ? 'success' : row.margin >= 30 ? 'info' : 'warn'}>{formatPercent(row.margin)}</Badge>
      ),
    },
  ];

  return (
    <div className="page">
      <PageHeader
        eyebrow="Analytics"
        title="Performance analytics"
        subtitle={`Revenue, orders and product performance over the ${RANGE_LABEL[range]}.`}
        actions={
          <Segmented ariaLabel="Select date range" value={range} onChange={(value) => setRange(value as RangeKey)} items={RANGE_OPTIONS} />
        }
      />

      <MetricGrid metrics={data.metrics} currency={data.currency} />

      <RevenueTrendCard series={data.series} currency={data.currency} range={range} />

      <div className="grid grid--2">
        <OrderVolumeCard series={data.series} range={range} />
        <ChannelRevenueCard channels={data.channels} currency={data.currency} />
      </div>

      <div className="grid grid--2">
        <Card>
          <CardHeader
            title="Product performance"
            subtitle={`Top ${products.length} by ${SORT_OPTIONS.find((option) => option.key === sortKey)?.label.toLowerCase()}`}
            actions={<Segmented ariaLabel="Sort products by" value={sortKey} onChange={(value) => setSortKey(value as SortKey)} items={SORT_OPTIONS} />}
          />
          <CardBody flush>
            <DataTable
              columns={columns}
              rows={products}
              rowKey={(row) => row.productId}
              sort={{ key: sortKey, dir: 'desc' }}
              onSort={(key) => setSortKey(key as SortKey)}
              onRowClick={(row) => navigate(`/products?search=${encodeURIComponent(row.sku)}`)}
              empty={<EmptyState icon="box" title="No product sales in range" text="Try a wider date range or place a demo order." />}
            />
          </CardBody>
        </Card>
        <div className="stack stack--gap">
          <OrderStatusCard statuses={data.statuses} />
          <CoherenceCard orders={data.orders} currency={data.currency} />
        </div>
      </div>
    </div>
  );
}

export default AnalyticsPage;
