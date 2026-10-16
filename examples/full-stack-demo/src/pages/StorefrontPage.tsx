import { useState } from 'react';
import type { Product } from '../data/types';
import type { StorefrontData } from '../lib/dto';
import { useApi, useDebounced, useDocumentTitle } from '../lib/hooks';
import { useRouter } from '../lib/router';
import { useApp } from '../app/AppContext';
import { formatCurrency, formatNumber } from '../lib/utils';
import { PageHeader } from '../components/layout/PageHeader';
import { StoreProductCard } from '../components/storefront/StoreProductCard';
import { CartDrawer } from '../components/storefront/CartDrawer';
import { Button } from '../components/ui/Button';
import { Card, EmptyState, StatCard } from '../components/ui/Display';
import { SearchBox } from '../components/ui/Form';
import { ChipRow } from '../components/ui/Nav';
import { ErrorState, LoadingState } from '../components/ui/Feedback';

export function StorefrontPage() {
  useDocumentTitle('Storefront — Northstar Commerce');
  const { navigate } = useRouter();
  const { addToCart, pushToast, cartCount, currency } = useApp();

  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [cartOpen, setCartOpen] = useState(false);
  const debounced = useDebounced(query, 300);

  const path = `/api/storefront/products?search=${encodeURIComponent(debounced)}&category=${encodeURIComponent(category)}`;
  const catalog = useApi<StorefrontData>(path);

  const products = catalog.data?.items ?? [];
  const categories = catalog.data?.categories ?? [];

  function handleAdd(product: Product) {
    addToCart({ productId: product.id, name: product.name, sku: product.sku, unitPrice: product.price, accent: product.accent, stock: product.stock }, 1);
    pushToast({ tone: 'success', title: 'Added to cart', text: `${product.name} · ${formatCurrency(product.price, currency)}` });
  }

  const chips = [{ key: 'all', label: 'All' }, ...categories.map((entry) => ({ key: entry.id, label: entry.name }))];

  return (
    <div className="page">
      <PageHeader
        eyebrow="Storefront"
        title="Browse the catalogue"
        subtitle="The shopper-facing view backed by the same catalogue the console edits. Add items, then head to checkout."
        actions={
          <>
            <Button variant="secondary" icon="cart" onClick={() => setCartOpen(true)}>
              Cart{cartCount > 0 ? ` (${cartCount})` : ''}
            </Button>
            <Button variant="primary" icon="creditCard" onClick={() => navigate('/checkout')}>
              Go to checkout
            </Button>
          </>
        }
      />

      <div className="store-hero">
        <div className="stack" style={{ gap: 6 }}>
          <span className="page-eyebrow">Free shipping over $75</span>
          <h2>Northstar essentials, delivered fast.</h2>
          <p className="page-subtitle">Every product below is served from the live demo API. Adding to the cart decrements no stock until you place the order.</p>
        </div>
        <div className="row row--gap">
          <StatCard label="Items in this view" value={String(products.length)} icon="box" tone="brand" />
          <StatCard label="Cart lines" value={String(cartCount)} icon="cart" tone="info" onClick={() => setCartOpen(true)} />
        </div>
      </div>

      <Card>
        <div className="table-toolbar">
          <SearchBox value={query} onChange={setQuery} placeholder="Search the shop…" aria-label="Search the storefront" className="grow" />
          <ChipRow items={chips} value={category} onChange={setCategory} />
        </div>
        <div className="card-body">
          {catalog.error ? (
            <ErrorState message={catalog.error.message} onRetry={catalog.reload} />
          ) : catalog.loading && products.length === 0 ? (
            <LoadingState label="Loading products…" />
          ) : products.length === 0 ? (
            <EmptyState icon="package" title="No products match" text="Try a different search term or clear the category filter." action={<Button variant="secondary" onClick={() => { setQuery(''); setCategory('all'); }}>Clear filters</Button>} />
          ) : (
            <div className="product-grid">
              {products.map((product) => (
                <StoreProductCard key={product.id} product={product} currency={currency} onAdd={handleAdd} />
              ))}
            </div>
          )}
        </div>
        <div className="card-footer">
          <span className="dim">{formatNumber(products.length)} product{products.length === 1 ? '' : 's'} visible</span>
          <span className="spacer" />
          <span className="dim">Prices in {currency}</span>
        </div>
      </Card>

      <CartDrawer open={cartOpen} onClose={() => setCartOpen(false)} onCheckout={() => navigate('/checkout')} />
    </div>
  );
}
