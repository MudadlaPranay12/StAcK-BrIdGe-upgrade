import { useState } from 'react';
import type { ProductDetail } from '../lib/dto';
import { useApi, useDocumentTitle } from '../lib/hooks';
import { useRouter } from '../lib/router';
import { useApp } from '../app/AppContext';
import { formatCurrency, formatNumber, formatPercent, pluralize } from '../lib/utils';
import { Button } from '../components/ui/Button';
import { Badge, Card, EmptyState, KeyValue, Progress, Thumb } from '../components/ui/Display';
import { ErrorState, LoadingState } from '../components/ui/Feedback';
import { ProductStatusBadge } from '../components/common/StatusBadge';

export function StoreProductPage() {
  const { match, navigate } = useRouter();
  const { addToCart, pushToast, currency } = useApp();
  const params = match('/storefront/:id');
  const id = params?.params.id ?? null;
  const { data, error, loading, reload } = useApi<ProductDetail>(id ? `/api/products/${id}` : null);
  const [qty, setQty] = useState(1);

  useDocumentTitle(data ? `${data.item.name} — Northstar` : 'Product — Northstar');

  if (!id) {
    return (
      <div className="page">
        <EmptyState icon="package" title="Product not found" text="That product id does not exist." action={<Button variant="secondary" onClick={() => navigate('/storefront')}>Back to storefront</Button>} />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="page">
        <LoadingState label="Loading product…" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="page">
        <ErrorState message={error.message} onRetry={reload} />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="page">
        <EmptyState icon="package" title="Product not found" text="That product id does not exist." action={<Button variant="secondary" onClick={() => navigate('/storefront')}>Back to storefront</Button>} />
      </div>
    );
  }

  const product = data.item;
  const soldOut = product.stock <= 0;

  function addToCartAndStay() {
    addToCart({ productId: product.id, name: product.name, sku: product.sku, unitPrice: product.price, accent: product.accent, stock: product.stock }, qty);
    pushToast({ tone: 'success', title: 'Added to cart', text: `${qty} × ${product.name}` });
    setQty(1);
  }

  function addToCartAndCheckout() {
    addToCart({ productId: product.id, name: product.name, sku: product.sku, unitPrice: product.price, accent: product.accent, stock: product.stock }, qty);
    navigate('/checkout');
  }

  return (
    <div className="page">
      <div className="breadcrumbs">
        <button type="button" onClick={() => navigate('/storefront')}>
          Storefront
        </button>
        <span>/</span>
        <span>{product.name}</span>
      </div>

      <div className="grid grid--sidebar">
        <Card>
          <div className="card-body" style={{ display: 'grid', placeItems: 'center', padding: 24 }}>
            <Thumb label={product.name} accent={product.accent} size="xl" />
          </div>
          <div className="card-body">
            <div className="row row--between row--gap row--wrap">
              <div className="stack" style={{ gap: 6 }}>
                <span className="row row--gap">
                  {data.category ? <Badge tone="brand">{data.category.name}</Badge> : null}
                  <ProductStatusBadge status={product.status} />
                </span>
                <h1 className="page-title">{product.name}</h1>
                <span className="mono dim">{product.sku}</span>
              </div>
              <div className="stack" style={{ alignItems: 'flex-end', gap: 4 }}>
                <span className="price" style={{ fontSize: 30 }}>
                  {formatCurrency(product.price, currency)}
                </span>
                <span className="rating">
                  ★ {product.rating.toFixed(1)} · {formatNumber(product.unitsSold)} {pluralize(product.unitsSold, 'unit')} sold
                </span>
              </div>
            </div>
            <hr className="divider" style={{ margin: '16px 0' }} />
            <p className="muted" style={{ lineHeight: 1.6 }}>
              {product.description}
            </p>
          </div>
        </Card>

        <div className="stack stack--gap">
          <Card>
            <div className="card-header">
              <span className="card-title">Order this item</span>
              <span className="card-subtitle">{soldOut ? 'Out of stock' : `${formatNumber(product.stock)} available`}</span>
            </div>
            <div className="card-body stack stack--gap">
              <div className="row row--between row--gap">
                <span className="muted">Quantity</span>
                <span className="qty">
                  <button type="button" onClick={() => setQty((value) => Math.max(1, value - 1))} disabled={qty <= 1} aria-label="Decrease quantity">
                    −
                  </button>
                  <span>{qty}</span>
                  <button type="button" onClick={() => setQty((value) => Math.min(product.stock, value + 1))} disabled={qty >= product.stock} aria-label="Increase quantity">
                    +
                  </button>
                </span>
              </div>
              <div className="row row--between">
                <span className="muted">Line total</span>
                <span className="strong">{formatCurrency(product.price * qty, currency)}</span>
              </div>
              <Button variant="primary" block icon="cart" disabled={soldOut} onClick={addToCartAndStay}>
                {soldOut ? 'Sold out' : 'Add to cart'}
              </Button>
              <Button variant="secondary" block icon="creditCard" disabled={soldOut} onClick={addToCartAndCheckout}>
                Add and go to checkout
              </Button>
              <Button variant="ghost" block onClick={() => navigate('/storefront')}>
                Continue shopping
              </Button>
            </div>
          </Card>

          <Card>
            <div className="card-header">
              <span className="card-title">Details</span>
            </div>
            <div className="card-body">
              <KeyValue
                rows={[
                  { key: 'Category', value: data.category?.name ?? '—' },
                  { key: 'Unit cost', value: formatCurrency(product.cost, currency) },
                  { key: 'Reorder point', value: `${formatNumber(product.reorderPoint)} ${pluralize(product.reorderPoint, 'unit')}` },
                  { key: 'Created', value: product.createdAt },
                ]}
              />
            </div>
          </Card>

          <Card>
            <div className="card-header">
              <span className="card-title">90-day performance</span>
            </div>
            <div className="card-body stack stack--gap-sm">
              <div className="meter-head">
                <span>Units sold</span>
                <span className="strong">{formatNumber(data.performance.units)}</span>
              </div>
              <div className="meter-head">
                <span>Merchandise revenue</span>
                <span className="strong">{formatCurrency(data.performance.revenue, currency)}</span>
              </div>
              <div className="meter-head">
                <span>Gross margin</span>
                <span className="strong">{formatPercent(data.performance.margin)}</span>
              </div>
              <Progress value={data.performance.margin} tone="success" />
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
