import { useEffect, useState } from 'react';
import type { OrderRow } from '../lib/dto';
import type { Paged } from '../lib/dto';
import { useApi, useDebounced, useDocumentTitle } from '../lib/hooks';
import { useRouter } from '../lib/router';
import { useApp } from '../app/AppContext';
import { downloadCsv, toCsv, titleCase } from '../lib/utils';
import { PageHeader } from '../components/layout/PageHeader';
import { OrderTable } from '../components/orders/OrderTable';
import { OrderDrawer } from '../components/orders/OrderDrawer';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Display';
import { SearchBox } from '../components/ui/Form';
import { ChipRow } from '../components/ui/Nav';
import { Pagination } from '../components/ui/Table';
import { ErrorState, LoadingState } from '../components/ui/Feedback';

const STATUS_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'processing', label: 'Processing' },
  { key: 'shipped', label: 'Shipped' },
  { key: 'delivered', label: 'Delivered' },
  { key: 'cancelled', label: 'Cancelled' },
];

export function OrdersPage() {
  useDocumentTitle('Orders — Northstar Commerce');
  const { currency } = useApp();
  const { search, navigate } = useRouter();
  const params = new URLSearchParams(search);

  const [query, setQuery] = useState(params.get('search') ?? '');
  const [status, setStatus] = useState(params.get('status') ?? 'all');
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(params.get('id'));

  const debounced = useDebounced(query, 300);

  const path = `/api/orders?search=${encodeURIComponent(debounced)}&status=${encodeURIComponent(status)}&page=${page}&pageSize=10`;
  const orders = useApi<Paged<OrderRow>>(path);

  useEffect(() => {
    setPage(1);
  }, [debounced, status]);

  const items = orders.data?.items ?? [];

  function exportCsv() {
    const rows = items.map((order) => ({
      id: order.id,
      customer: order.customer?.name ?? 'Guest',
      email: order.customer?.email ?? '',
      placedAt: order.createdAt,
      channel: order.channel,
      items: order.items.length,
      total: order.total,
      status: order.status,
    }));
    downloadCsv('northstar-orders.csv', toCsv(rows));
  }

  return (
    <div className="page">
      <PageHeader
        eyebrow="Orders"
        title="Orders"
        subtitle={`${orders.data?.total ?? 0} orders match the current filter. Open any row to inspect line items, totals and history.`}
        actions={
          <Button variant="secondary" icon="download" onClick={exportCsv} disabled={items.length === 0}>
            Export CSV
          </Button>
        }
      />

      <Card>
        <div className="table-toolbar">
          <SearchBox value={query} onChange={setQuery} placeholder="Search order id, name or email…" aria-label="Search orders" className="grow" />
          <ChipRow items={STATUS_FILTERS} value={status} onChange={setStatus} />
        </div>

        {orders.error ? (
          <div className="card-body">
            <ErrorState message={orders.error.message} onRetry={orders.reload} />
          </div>
        ) : (
          <>
            <OrderTable orders={items} currency={currency} loading={orders.loading} onOpen={(order) => setSelectedId(order.id)} selectedId={selectedId} />
            <div className="table-footer">
              <span className="dim">Status: {titleCase(status === 'all' ? 'all' : status)}</span>
              <span className="spacer" />
              {orders.data ? (
                <Pagination page={orders.data.page} pageCount={orders.data.pageCount} total={orders.data.total} pageSize={orders.data.pageSize} onPage={setPage} />
              ) : null}
            </div>
          </>
        )}
      </Card>

      {orders.loading && items.length === 0 ? <LoadingState label="Loading orders…" /> : null}

      <OrderDrawer
        orderId={selectedId}
        currency={currency}
        onClose={() => {
          setSelectedId(null);
          navigate('/orders', { replace: true });
        }}
        onUpdated={() => orders.reload()}
      />
    </div>
  );
}
