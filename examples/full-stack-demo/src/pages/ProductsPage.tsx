import { useEffect, useMemo, useState } from 'react';
import type { Category, Product } from '../data/types';
import type { CategoryListResponse, Paged, CategoryWithCount } from '../lib/dto';
import { ApiError, apiRequest } from '../lib/api';
import { useApi, useDebounced, useDocumentTitle } from '../lib/hooks';
import { useRouter } from '../lib/router';
import { describeError, useApp, useToast } from '../app/AppContext';
import { downloadCsv, toCsv, titleCase } from '../lib/utils';
import { PageHeader } from '../components/layout/PageHeader';
import { ProductTable } from '../components/products/ProductTable';
import { ProductDrawer } from '../components/products/ProductDrawer';
import { StockAdjustDialog } from '../components/products/StockAdjustDialog';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Display';
import { SelectInput, SearchBox } from '../components/ui/Form';
import { ChipRow } from '../components/ui/Nav';
import { Pagination } from '../components/ui/Table';
import { ConfirmDialog } from '../components/ui/Overlay';
import { ErrorState, LoadingState } from '../components/ui/Feedback';

const STATUSES = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'draft', label: 'Draft' },
  { key: 'archived', label: 'Archived' },
];

export function ProductsPage() {
  useDocumentTitle('Products — Northstar Commerce');
  const toast = useToast();
  const { search } = useRouter();
  const initialSearch = new URLSearchParams(search).get('search') ?? '';

  const [query, setQuery] = useState(initialSearch);
  const [category, setCategory] = useState('all');
  const [status, setStatus] = useState('all');
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' }>({ key: 'name', dir: 'asc' });
  const [page, setPage] = useState(1);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [stockProduct, setStockProduct] = useState<Product | null>(null);
  const [deleting, setDeleting] = useState<Product | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const debounced = useDebounced(query, 300);

  const categoriesResult = useApi<CategoryListResponse>('/api/categories');
  const categories: CategoryWithCount[] = useMemo(() => categoriesResult.data?.items ?? [], [categoriesResult.data]);

  const path = `/api/products?search=${encodeURIComponent(debounced)}&category=${encodeURIComponent(category)}&status=${encodeURIComponent(status)}&sort=${sort.key}&dir=${sort.dir}&page=${page}&pageSize=10`;
  const products = useApi<Paged<Product>>(path);

  useEffect(() => {
    setPage(1);
  }, [debounced, category, status]);

  const items = products.data?.items ?? [];
  const categoriesById = useMemo(() => {
    const map: Record<string, Category> = {};
    categories.forEach((entry) => {
      map[entry.id] = { id: entry.id, name: entry.name, slug: entry.slug, accent: entry.accent };
    });
    return map;
  }, [categories]);

  function handleSort(key: string) {
    setSort((current) => (current.key === key ? { key, dir: current.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));
  }

  function openCreate() {
    setEditing(null);
    setDrawerOpen(true);
  }

  function openEdit(product: Product) {
    setEditing(product);
    setDrawerOpen(true);
  }

  function exportCsv() {
    const rows = items.map((product) => ({
      id: product.id,
      sku: product.sku,
      name: product.name,
      category: categoriesById[product.categoryId]?.name ?? '',
      price: product.price,
      cost: product.cost,
      stock: product.stock,
      status: product.status,
      rating: product.rating,
      unitsSold: product.unitsSold,
    }));
    downloadCsv('northstar-products.csv', toCsv(rows));
    toast({ tone: 'success', title: 'Export ready', text: `${rows.length} rows written to northstar-products.csv` });
  }

  async function confirmDelete() {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      await apiRequest(`/api/products/${deleting.id}`, { method: 'DELETE' });
      toast({ tone: 'success', title: 'Product archived', text: deleting.name });
      setDeleting(null);
      products.reload();
    } catch (error) {
      toast({ tone: 'error', title: 'Could not archive product', text: describeError(error) });
    } finally {
      setDeleteBusy(false);
    }
  }

  const { currency } = useApp();

  return (
    <div className="page">
      <PageHeader
        eyebrow="Catalogue"
        title="Products"
        subtitle={`${products.data?.total ?? 0} products in the demo catalogue. Sort, filter and manage inventory.`}
        actions={
          <>
            <Button variant="secondary" icon="download" onClick={exportCsv} disabled={items.length === 0}>
              Export CSV
            </Button>
            <Button variant="primary" icon="plus" onClick={openCreate}>
              New product
            </Button>
          </>
        }
      />

      {categoriesResult.error ? (
        <ErrorState message={categoriesResult.error.message} onRetry={categoriesResult.reload} />
      ) : null}

      <Card>
        <div className="table-toolbar">
          <SearchBox value={query} onChange={setQuery} placeholder="Search by name or SKU…" aria-label="Search products" className="grow" />
          <ChipRow items={STATUSES} value={status} onChange={setStatus} />
          <SelectInput value={category} onChange={(event) => setCategory(event.target.value)} aria-label="Filter by category" style={{ width: 200 }}>
            <option value="all">All categories</option>
            {categories.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.name}
              </option>
            ))}
          </SelectInput>
        </div>

        {products.error ? (
          <div className="card-body">
            <ErrorState message={products.error.message} onRetry={products.reload} />
          </div>
        ) : (
          <>
            <ProductTable
              products={items}
              categoriesById={categoriesById}
              currency={currency}
              loading={products.loading}
              sort={sort}
              onSort={handleSort}
              onEdit={openEdit}
              onAdjustStock={setStockProduct}
              onDelete={setDeleting}
            />

            <div className="table-footer">
              <span className="dim">{titleCase(status === 'all' ? 'all statuses' : status)}</span>
              <span className="spacer" />
              {products.data ? (
                <Pagination page={products.data.page} pageCount={products.data.pageCount} total={products.data.total} pageSize={products.data.pageSize} onPage={setPage} />
              ) : null}
            </div>
          </>
        )}
      </Card>

      {products.loading && items.length === 0 ? <LoadingState label="Loading products…" /> : null}

      <ProductDrawer
        open={drawerOpen}
        product={editing}
        categories={categories}
        onClose={() => setDrawerOpen(false)}
        onSaved={() => products.reload()}
      />

      <StockAdjustDialog
        open={Boolean(stockProduct)}
        product={stockProduct}
        onClose={() => setStockProduct(null)}
        onAdjusted={() => products.reload()}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Archive product?"
        message={`Archive “${deleting?.name ?? ''}” (SKU ${deleting?.sku ?? ''})? It will be removed from the active catalogue.`}
        confirmLabel="Archive"
        busy={deleteBusy}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}
