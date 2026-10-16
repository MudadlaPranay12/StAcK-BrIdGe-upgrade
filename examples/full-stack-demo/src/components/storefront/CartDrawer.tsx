import { useEffect, useState, type FormEvent } from 'react';
import { computeCheckoutTotals, type OrderTotals } from '../../data/pricing';
import type { OrderItem } from '../../data/types';
import { ApiError } from '../../lib/api';
import { describeError, useApp, useToast } from '../../app/AppContext';
import { formatCurrency } from '../../lib/utils';
import { Drawer } from '../ui/Overlay';
import { Button } from '../ui/Button';
import { IconButton } from '../ui/Button';
import { TextInput } from '../ui/Form';
import { Alert, Badge, EmptyState, Thumb } from '../ui/Display';

function totalsFromCart(lines: Array<{ productId: string; name: string; sku: string; unitPrice: number; qty: number }>, coupon: ReturnType<typeof useApp>['coupon']): OrderTotals & { discount: number } {
  const items: OrderItem[] = lines.map((line) => ({
    productId: line.productId,
    name: line.name,
    sku: line.sku,
    qty: line.qty,
    unitPrice: line.unitPrice,
  }));
  return computeCheckoutTotals(items, coupon);
}

interface CartDrawerProps {
  open: boolean;
  onClose: () => void;
  onCheckout: () => void;
}

export function CartDrawer({ open, onClose, onCheckout }: CartDrawerProps) {
  const toast = useToast();
  const { cart, currency, coupon, applyCoupon, clearCoupon, setLineQty, removeLine, clearCart } = useApp();
  const [code, setCode] = useState('');
  const [couponError, setCouponError] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    if (!open) {
      setCode('');
      setCouponError(null);
    }
  }, [open]);

  const totals = totalsFromCart(cart, coupon);

  async function submitCoupon(event: FormEvent) {
    event.preventDefault();
    if (!code.trim()) {
      setCouponError('Enter a coupon code.');
      return;
    }
    setApplying(true);
    setCouponError(null);
    try {
      const applied = await applyCoupon(code.trim(), totals.subtotal);
      toast({ tone: 'success', title: `Coupon ${applied.code} applied`, text: applied.label });
      setCode('');
    } catch (error) {
      const message = error instanceof ApiError && error.fieldIssues.length > 0 ? error.fieldIssues[0]!.message : describeError(error);
      setCouponError(message);
    } finally {
      setApplying(false);
    }
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Your cart"
      subtitle={`${cart.length} line${cart.length === 1 ? '' : 's'}`}
      footer={
        cart.length > 0 ? (
          <>
            <Button variant="ghost" icon="trash" onClick={clearCart}>
              Clear
            </Button>
            <span className="spacer" />
            <Button
              variant="primary"
              icon="creditCard"
              onClick={() => {
                onClose();
                onCheckout();
              }}
            >
              Checkout · {formatCurrency(totals.total, currency)}
            </Button>
          </>
        ) : null
      }
    >
      {cart.length === 0 ? (
        <EmptyState icon="cart" title="Your cart is empty" text="Browse the storefront and add a product to get started." />
      ) : (
        <>
          <div>
            {cart.map((line) => (
              <div className="cart-line" key={line.productId}>
                <Thumb label={line.name} accent={line.accent} size="lg" />
                <div className="stack grow" style={{ gap: 6 }}>
                  <div className="row row--between">
                    <span className="row-primary">{line.name}</span>
                    <IconButton icon="close" label={`Remove ${line.name}`} variant="plain" size="sm" onClick={() => removeLine(line.productId)} />
                  </div>
                  <span className="cell-sub mono">{line.sku}</span>
                  <div className="row row--between">
                    <span className="qty">
                      <button type="button" onClick={() => setLineQty(line.productId, line.qty - 1)} aria-label="Decrease quantity">
                        −
                      </button>
                      <span>{line.qty}</span>
                      <button type="button" onClick={() => setLineQty(line.productId, line.qty + 1)} disabled={line.qty >= line.stock} aria-label="Increase quantity">
                        +
                      </button>
                    </span>
                    <span className="strong">{formatCurrency(line.unitPrice * line.qty, currency)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <form className="stack stack--gap-sm" onSubmit={submitCoupon}>
            <div className="row row--gap">
              <TextInput value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} placeholder="Coupon code" aria-label="Coupon code" invalid={Boolean(couponError)} />
              <Button variant="secondary" type="submit" loading={applying} disabled={Boolean(coupon)}>
                Apply
              </Button>
            </div>
            {couponError ? <span className="field-error">{couponError}</span> : null}
            {coupon ? (
              <div className="row row--between">
                <Badge tone="success" dot>
                  {coupon.code} · {coupon.label}
                </Badge>
                <button className="link" type="button" onClick={clearCoupon}>
                  Remove
                </button>
              </div>
            ) : (
              <span className="field-hint">Try NORTHSTAR10, WELCOME5 or FREESHIP.</span>
            )}
          </form>

          <div className="cart-summary">
            <div className="cart-summary-row">
              <span className="label">Subtotal</span>
              <span>{formatCurrency(totals.subtotal, currency)}</span>
            </div>
            {totals.discount > 0 ? (
              <div className="cart-summary-row">
                <span className="label">Discount</span>
                <span className="pos">−{formatCurrency(totals.discount, currency)}</span>
              </div>
            ) : null}
            <div className="cart-summary-row">
              <span className="label">Shipping</span>
              <span>{totals.shipping === 0 ? 'Free' : formatCurrency(totals.shipping, currency)}</span>
            </div>
            <div className="cart-summary-row">
              <span className="label">Estimated tax</span>
              <span>{formatCurrency(totals.tax, currency)}</span>
            </div>
            <div className="cart-summary-row cart-summary-row--total">
              <span>Total</span>
              <span>{formatCurrency(totals.total, currency)}</span>
            </div>
          </div>

          <Alert tone="info">This is a demo store. No payment details are collected and no real order is charged.</Alert>
        </>
      )}
    </Drawer>
  );
}
