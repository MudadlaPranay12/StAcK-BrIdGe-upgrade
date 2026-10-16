import { useState } from 'react';
import type { RangeKey } from '../data/types';
import type { OverviewData } from '../lib/dto';
import { useApi, useDocumentTitle } from '../lib/hooks';
import { useRouter } from '../lib/router';
import { formatCurrency } from '../lib/utils';
import { PageHeader } from '../components/layout/PageHeader';
import { MetricGrid } from '../components/dashboard/MetricGrid';
import {
  ActivityFeedCard,
  ChannelMixCard,
  LowStockCard,
  OrderStatusCard,
  RecentOrdersCard,
  SalesTrendCard,
  TopProductsCard,
} from '../components/dashboard/OverviewCards';
import { Button } from '../components/ui/Button';
import { ErrorState, LoadingState } from '../components/ui/Feedback';

export function DashboardPage() {
  useDocumentTitle('Overview — Northstar Commerce');
  const { navigate } = useRouter();
  const [range, setRange] = useState<RangeKey>('30d');
  const { data, error, loading, reload } = useApi<OverviewData>(`/api/overview?range=${range}`);

  if (error) {
    return (
      <div className="page">
        <PageHeader eyebrow="Overview" title="Operations dashboard" subtitle="Store performance at a glance." />
        <ErrorState message={error.message} onRetry={reload} />
      </div>
    );
  }

  if (loading || !data) {
    return (
      <div className="page">
        <PageHeader eyebrow="Overview" title="Operations dashboard" subtitle="Store performance at a glance." />
        <LoadingState label="Loading the overview…" />
      </div>
    );
  }

  return (
    <div className="page">
      <PageHeader
        eyebrow="Overview"
        title="Operations dashboard"
        subtitle={`${formatCurrency(data.metrics.revenue, data.currency)} recognised over the last ${range === '7d' ? '7 days' : range === '30d' ? '30 days' : '90 days'} across every sales channel.`}
        actions={
          <>
            <Button variant="ghost" icon="refresh" onClick={reload}>
              Refresh
            </Button>
            <Button variant="primary" icon="store" onClick={() => navigate('/storefront')}>
              Open storefront
            </Button>
          </>
        }
      />

      <MetricGrid metrics={data.metrics} currency={data.currency} onSelect={() => navigate('/analytics')} />

      <div className="grid grid--2">
        <SalesTrendCard series={data.series} currency={data.currency} range={range} onRangeChange={setRange} />
        <ChannelMixCard channels={data.channels} currency={data.currency} />
      </div>

      <div className="grid grid--2">
        <RecentOrdersCard orders={data.recentOrders} currency={data.currency} onOpen={(id) => navigate(`/orders?id=${encodeURIComponent(id)}`)} onViewAll={() => navigate('/orders')} />
        <ActivityFeedCard activity={data.activity} />
      </div>

      <div className="grid grid--3">
        <TopProductsCard products={data.topProducts} currency={data.currency} />
        <OrderStatusCard statuses={data.statuses} />
        <LowStockCard products={data.lowStock} onViewProducts={() => navigate('/products')} />
      </div>
    </div>
  );
}
