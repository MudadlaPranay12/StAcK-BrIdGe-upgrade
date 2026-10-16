import { useState } from 'react';
import type { CustomerRow } from '../lib/dto';
import { useApi, useDebounced, useDocumentTitle } from '../lib/hooks';
import { useRouter } from '../lib/router';
import { useApp } from '../app/AppContext';
import { downloadCsv, formatCurrency, formatPercent, toCsv } from '../lib/utils';
import { PageHeader } from '../components/layout/PageHeader';
import { CustomerTable } from '../components/customers/CustomerTable';
import { CustomerDrawer } from '../components/customers/CustomerDrawer';
import { Button } from '../components/ui/Button';
import { Card, StatCard } from '../components/ui/Display';
import { SearchBox } from '../components/ui/Form';
import { ChipRow } from '../components/ui/Nav';
import { ErrorState, LoadingState } from '../components/ui/Feedback';

const SEGMENTS = [
  { key: 'all', label: 'All segments' },
  { key: 'vip', label: 'VIP' },
  { key: 'returning', label: 'Returning' },
  { key: 'new', label: 'New' },
  { key: 'at-risk', label: 'At risk' },
];

interface CustomerListResponse {
  items: CustomerRow[];
  total: number;
}

export function CustomersPage() {
  useDocumentTitle('Customers — Northstar Commerce');
  const { currency } = useApp();
  const { navigate } = useRouter();
  const [query, setQuery] = useState('');
  const [segment, setSegment] = useState('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const debounced = useDebounced(query, 300);

  const path = `/api/customers?search=${encodeURIComponent(debounced)}&segment=${encodeURIComponent(segment)}`;
  const customers = useApi<CustomerListResponse>(path);
  const items = customers.data?.items ?? [];

  const vipShare = items.length === 0 ? 0 : (items.filter((customer) => customer.segment === 'vip').length / items.length) * 100;
  const revenue = items.reduce((sum, customer) => sum + customer.metrics.lifetimeValue, 0);

  function exportCsv() {
    const rows = items.map((customer) => ({
      id: customer.id,
      name: customer.name,
      email: customer.email,
      company: customer.company,
      segment: customer.segment,
      orders: customer.metrics.orders,
      lifetimeValue: customer.metrics.lifetimeValue,
      joinedAt: customer.joinedAt,
    }));
    downloadCsv('northstar-customers.csv', toCsv(rows));
  }

  return (
    <div className="page">
      <PageHeader
        eyebrow="Audience"
        title="Customers"
        subtitle={`${customers.data?.total ?? 0} customers in the selected segment.`}
        actions={
          <Button variant="secondary" icon="download" onClick={exportCsv} disabled={items.length === 0}>
            Export CSV
          </Button>
        }
      />

      <div className="grid grid--3">
        <StatCard label="Customers shown" value={String(items.length)} icon="users" tone="brand" foot="Matching the current filter" />
        <StatCard label="Combined lifetime value" value={formatCurrency(revenue, currency)} icon="dollar" tone="success" foot="Across filtered customers" />
        <StatCard label="VIP share" value={formatPercent(vipShare)} icon="star" tone="warn" foot="Of the customers shown" />
      </div>

      <Card>
        <div className="table-toolbar">
          <SearchBox value={query} onChange={setQuery} placeholder="Search name or email…" aria-label="Search customers" className="grow" />
          <ChipRow items={SEGMENTS} value={segment} onChange={setSegment} />
        </div>

        {customers.error ? (
          <div className="card-body">
            <ErrorState message={customers.error.message} onRetry={customers.reload} />
          </div>
        ) : (
          <CustomerTable
            customers={items}
            currency={currency}
            loading={customers.loading}
            onOpen={(customer) => setSelectedId(customer.id)}
            selectedId={selectedId}
          />
        )}
      </Card>

      {customers.loading && items.length === 0 ? <LoadingState label="Loading customers…" /> : null}

      <CustomerDrawer
        customerId={selectedId}
        currency={currency}
        onClose={() => setSelectedId(null)}
        onOpenOrder={(orderId) => {
          setSelectedId(null);
          navigate(`/orders?id=${encodeURIComponent(orderId)}`);
        }}
      />
    </div>
  );
}
