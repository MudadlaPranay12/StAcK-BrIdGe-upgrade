import type { MetricSummary } from '../../data/types';
import { formatCurrency, formatNumber, formatPercent } from '../../lib/utils';
import { StatCard } from '../ui/Display';

interface MetricGridProps {
  metrics: MetricSummary;
  currency: string;
  onSelect?: (key: 'revenue' | 'orders' | 'aov' | 'conversion') => void;
}

/** The four headline KPIs. Each is clickable and routes to the relevant view. */
export function MetricGrid({ metrics, currency, onSelect }: MetricGridProps) {
  return (
    <div className="grid grid--4">
      <StatCard
        label="Revenue"
        value={formatCurrency(metrics.revenue, currency)}
        icon="dollar"
        tone="brand"
        delta={metrics.revenueDelta}
        foot={`${formatNumber(metrics.units)} units sold`}
        onClick={onSelect ? () => onSelect('revenue') : undefined}
      />
      <StatCard
        label="Orders"
        value={formatNumber(metrics.orders)}
        icon="receipt"
        tone="info"
        delta={metrics.ordersDelta}
        foot="Across all sales channels"
        onClick={onSelect ? () => onSelect('orders') : undefined}
      />
      <StatCard
        label="Average order value"
        value={formatCurrency(metrics.aov, currency)}
        icon="tag"
        tone="success"
        delta={metrics.aovDelta}
        foot="Excludes cancelled orders"
        onClick={onSelect ? () => onSelect('aov') : undefined}
      />
      <StatCard
        label="Conversion rate"
        value={formatPercent(metrics.conversionRate)}
        icon="percent"
        tone="warn"
        delta={metrics.conversionDelta}
        foot="Orders ÷ recorded sessions"
        onClick={onSelect ? () => onSelect('conversion') : undefined}
      />
    </div>
  );
}
