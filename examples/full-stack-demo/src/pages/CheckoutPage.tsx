import { useState } from 'react';
import type { Order } from '../data/types';
import { useDocumentTitle } from '../lib/hooks';
import { useRouter } from '../lib/router';
import { useApp } from '../app/AppContext';
import { formatCurrency, formatDateTime, formatNumber } from '../lib/utils';
import { PageHeader } from '../components/layout/PageHeader';
import { CheckoutForm } from '../components/storefront/CheckoutForm';
import { Button } from '../components/ui/Button';
import { Alert, Badge, Card, CardBody, CardHeader, KeyValue } from '../components/ui/Display';

type PlacedOrder = Order & { couponCode: string | null; discount: number };

export function CheckoutPage() {
  useDocumentTitle('Checkout — Northstar Commerce');
  const { navigate } = useRouter();
  const { cartCount, currency } = useApp();
  const [placed, setPlaced] = useState<PlacedOrder | null>(null);

  return (
    <div className="page">
      <PageHeader
        eyebrow="Storefront"
        title={placed ? 'Order placed' : 'Checkout'}
        subtitle={placed ? 'Your demo order was created and stock was adjusted.' : `${formatNumber(cartCount)} ${cartCount === 1 ? 'item' : 'items'} in your cart.`}
        actions={
          <Button variant="ghost" icon="store" onClick={() => navigate('/storefront')}>
            Continue shopping
          </Button>
        }
      />

      {placed ? (
        <Card>
          <CardHeader title={`Order ${placed.id} is on its way`} subtitle="Created against POST /api/orders" />
          <CardBody>
            <div className="stack stack--gap">
              <div className="row row--gap row--wrap">
                <Badge tone="success" dot>
                  Processing
                </Badge>
                <Badge tone="brand">{formatCurrency(placed.total, currency)}</Badge>
                <Badge tone="info">{formatDateTime(placed.createdAt)}</Badge>
                {placed.couponCode ? <Badge tone="violet">Coupon {placed.couponCode}</Badge> : null}
              </div>

              <Alert tone="success" title="No payment was taken">
                This is a simulated order. Stock for each purchased item was decremented in the in-memory store, so it now
                appears in the console and affects low-stock checks.
              </Alert>

              <KeyValue
                rows={[
                  { key: 'Line items', value: placed.items.map((item) => `${item.qty} × ${item.name}`).join(', ') },
                  { key: 'Shipping to', value: `${placed.shippingAddress.line1}, ${placed.shippingAddress.city} ${placed.shippingAddress.postalCode}` },
                  { key: 'Subtotal', value: formatCurrency(placed.subtotal, currency) },
                  ...(placed.discount > 0 ? [{ key: 'Discount', value: `−${formatCurrency(placed.discount, currency)}` }] : []),
                  { key: 'Shipping', value: placed.shipping === 0 ? 'Free' : formatCurrency(placed.shipping, currency) },
                  { key: 'Tax', value: formatCurrency(placed.tax, currency) },
                  { key: 'Total', value: formatCurrency(placed.total, currency) },
                ]}
              />

              <div className="row row--gap row--wrap">
                <Button variant="primary" icon="receipt" onClick={() => navigate(`/orders?id=${encodeURIComponent(placed.id)}`)}>
                  View in console
                </Button>
                <Button variant="secondary" onClick={() => setPlaced(null)}>
                  Place another order
                </Button>
                <Button variant="ghost" onClick={() => navigate('/storefront')}>
                  Back to storefront
                </Button>
              </div>
            </div>
          </CardBody>
        </Card>
      ) : (
        <CheckoutForm currency={currency} onSuccess={setPlaced} />
      )}
    </div>
  );
}
