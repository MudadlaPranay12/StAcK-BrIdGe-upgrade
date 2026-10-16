import { useState, type FormEvent } from 'react';
import type { Order, OrderItem } from '../../data/types';
import { computeCheckoutTotals } from '../../data/pricing';
import { ApiError, apiRequest, rawRequest } from '../../lib/api';
import { describeError, useApp, useToast } from '../../app/AppContext';
import { formatCurrency } from '../../lib/utils';
import { Card, CardBody, CardHeader, Alert, Badge, EmptyState, Thumb } from '../ui/Display';
import { Button } from '../ui/Button';
import { Field, SelectInput, TextInput } from '../ui/Form';
import { Segmented } from '../ui/Nav';

interface FieldIssue {
  field: string;
  message: string;
}

interface FailureReport {
  status: number;
  statusText: string;
  correlationId: string | null;
  traceId: string | null;
  message: string;
  durationMs: number;
}

const COUNTRIES = ['United States', 'Canada', 'United Kingdom', 'Australia', 'Germany'];

interface CheckoutFormProps {
  currency: string;
  onSuccess: (order: Order & { couponCode: string | null; discount: number }) => void;
}

export function CheckoutForm({ currency, onSuccess }: CheckoutFormProps) {
  const toast = useToast();
  const { cart, coupon, applyCoupon, clearCoupon, clearCart } = useApp();

  const [mode, setMode] = useState<'success' | 'failure'>('success');
  const [form, setForm] = useState({
    name: '',
    email: '',
    line1: '',
    city: '',
    region: '',
    postalCode: '',
    country: 'United States',
  });
  const [couponCode, setCouponCode] = useState('');
  const [couponError, setCouponError] = useState<string | null>(null);
  const [applyingCoupon, setApplyingCoupon] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [issues, setIssues] = useState<FieldIssue[]>([]);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [failure, setFailure] = useState<FailureReport | null>(null);

  const items: OrderItem[] = cart.map((line) => ({
    productId: line.productId,
    name: line.name,
    sku: line.sku,
    qty: line.qty,
    unitPrice: line.unitPrice,
  }));
  const totals = computeCheckoutTotals(items, coupon);

  const issueFor = (field: string) => issues.find((issue) => issue.field === field)?.message;

  function update<K extends keyof typeof form>(key: K, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function handleCoupon(event: FormEvent) {
    event.preventDefault();
    if (!couponCode.trim()) {
      setCouponError('Enter a coupon code.');
      return;
    }
    setApplyingCoupon(true);
    setCouponError(null);
    try {
      const applied = await applyCoupon(couponCode.trim(), totals.subtotal);
      toast({ tone: 'success', title: `Coupon ${applied.code} applied`, text: applied.label });
      setCouponCode('');
    } catch (error) {
      setCouponError(error instanceof ApiError && error.fieldIssues.length > 0 ? error.fieldIssues[0]!.message : describeError(error));
    } finally {
      setApplyingCoupon(false);
    }
  }

  async function placeOrder(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setIssues([]);
    setSubmitError(null);
    try {
      const result = await apiRequest<{ order: Order & { couponCode: string | null; discount: number } }>('/api/orders', {
        method: 'POST',
        body: {
          customer: { name: form.name, email: form.email },
          address: { line1: form.line1, city: form.city, region: form.region, postalCode: form.postalCode, country: form.country },
          items: cart.map((line) => ({ productId: line.productId, qty: line.qty })),
          couponCode: coupon?.code,
        },
      });
      const order = result.order;
      clearCart();
      toast({ tone: 'success', title: `Order ${order.id} placed`, text: formatCurrency(order.total, currency) });
      onSuccess(order);
    } catch (error) {
      if (error instanceof ApiError && error.fieldIssues.length > 0) {
        setIssues(error.fieldIssues);
        setSubmitError(error.message);
      } else {
        setSubmitError(describeError(error));
      }
      toast({ tone: 'error', title: 'Checkout failed', text: describeError(error) });
    } finally {
      setSubmitting(false);
    }
  }

  /** Explicitly triggers the preserved failing route so the trace can be inspected. */
  async function triggerFailure() {
    setSubmitting(true);
    setFailure(null);
    const result = await rawRequest('/api/checkout', { method: 'POST' });
    const message =
      (result.body && typeof result.body === 'object' && typeof result.body.error === 'string' && result.body.error) ||
      result.networkError ||
      `HTTP ${result.status} ${result.statusText}`;
    setFailure({
      status: result.status,
      statusText: result.statusText,
      correlationId: result.meta.correlationId,
      traceId: result.meta.traceId,
      message,
      durationMs: result.durationMs,
    });
    toast({ tone: 'error', title: `/api/checkout returned ${result.status}`, text: 'Open the StackBridge panel to correlate the stack trace.' });
    setSubmitting(false);
  }

  if (cart.length === 0 && mode === 'success') {
    return (
      <Card>
        <CardBody>
          <EmptyState
            icon="cart"
            title="Nothing to check out"
            text="Add a product from the storefront first, then return here to place a demo order."
          />
        </CardBody>
      </Card>
    );
  }

  return (
    <div className="stack stack--gap">
      <Card>
        <CardBody>
          <div className="row row--between row--gap row--wrap">
            <div className="stack" style={{ gap: 3 }}>
              <span className="strong">Demo checkout mode</span>
              <span className="dim">Choose which backend path the checkout button exercises.</span>
            </div>
            <Segmented
              ariaLabel="Checkout mode"
              value={mode}
              onChange={(value) => setMode(value as 'success' | 'failure')}
              items={[
                { key: 'success', label: 'Place a real order' },
                { key: 'failure', label: 'Trigger failing /api/checkout' },
              ]}
            />
          </div>
        </CardBody>
      </Card>

      {mode === 'failure' ? (
        <Card>
          <CardHeader title="Fail on purpose" subtitle="POST /api/checkout · preserved end-to-end crash demo" />
          <CardBody>
            <div className="stack stack--gap">
              <Alert tone="danger" title="This route always crashes">
                The server dereferences <span className="mono">user.profile.id</span> on an undefined value, producing a real 500 and a
                StackBridge backend trace. Use the panel to correlate the frontend click with the backend stack frame.
              </Alert>

              <Button variant="danger" icon="zap" loading={submitting} onClick={triggerFailure}>
                Send failing checkout request
              </Button>

              {failure ? (
                <div className="scenario-result">
                  <div className="scenario-result-head">
                    <span className={`status-pill ${failure.status >= 500 ? 'is-5xx' : failure.status >= 400 ? 'is-4xx' : 'is-2xx'}`}>{failure.status}</span>
                    <span className="strong">{failure.message}</span>
                    <span className="spacer" />
                    <span className="dim">{failure.durationMs} ms</span>
                  </div>
                  <div className="scenario-meta" style={{ padding: '8px 11px' }}>
                    <span>
                      Correlation: <span className="mono">{failure.correlationId ?? '—'}</span>
                    </span>
                    <span>
                      Trace: <span className="mono">{failure.traceId ?? '—'}</span>
                    </span>
                  </div>
                </div>
              ) : (
                <span className="dim">No request sent yet. The failing route fires only when you click above.</span>
              )}
            </div>
          </CardBody>
        </Card>
      ) : (
        <div className="grid grid--2">
          <div className="stack stack--gap">
            <Card>
              <CardHeader title="Contact" subtitle="Used only to build the demo order" />
              <CardBody>
                <div className="form-grid">
                  <Field label="Full name" required htmlFor="checkout-name" error={issueFor('name')} full>
                    <TextInput id="checkout-name" value={form.name} onChange={(event) => update('name', event.target.value)} invalid={Boolean(issueFor('name'))} placeholder="Jordan Avery" />
                  </Field>
                  <Field label="Email" required htmlFor="checkout-email" error={issueFor('email')} full>
                    <TextInput id="checkout-email" type="email" value={form.email} onChange={(event) => update('email', event.target.value)} invalid={Boolean(issueFor('email'))} placeholder="jordan@example.com" />
                  </Field>
                </div>
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="Shipping address" subtitle="Demo addresses are never geocoded or stored beyond memory" />
              <CardBody>
                <div className="form-grid">
                  <Field label="Address line 1" required htmlFor="checkout-line1" error={issueFor('line1')} full>
                    <TextInput id="checkout-line1" value={form.line1} onChange={(event) => update('line1', event.target.value)} invalid={Boolean(issueFor('line1'))} placeholder="221B Bay Street" />
                  </Field>
                  <Field label="City" required htmlFor="checkout-city" error={issueFor('city')}>
                    <TextInput id="checkout-city" value={form.city} onChange={(event) => update('city', event.target.value)} invalid={Boolean(issueFor('city'))} placeholder="San Diego" />
                  </Field>
                  <Field label="State / region" htmlFor="checkout-region" error={issueFor('region')}>
                    <TextInput id="checkout-region" value={form.region} onChange={(event) => update('region', event.target.value)} invalid={Boolean(issueFor('region'))} placeholder="CA" />
                  </Field>
                  <Field label="Postal code" required htmlFor="checkout-postal" error={issueFor('postalCode')}>
                    <TextInput id="checkout-postal" value={form.postalCode} onChange={(event) => update('postalCode', event.target.value)} invalid={Boolean(issueFor('postalCode'))} placeholder="92101" />
                  </Field>
                  <Field label="Country" htmlFor="checkout-country">
                    <SelectInput id="checkout-country" value={form.country} onChange={(event) => update('country', event.target.value)}>
                      {COUNTRIES.map((country) => (
                        <option key={country} value={country}>
                          {country}
                        </option>
                      ))}
                    </SelectInput>
                  </Field>
                </div>
              </CardBody>
            </Card>
          </div>

          <div className="stack stack--gap">
            <Card>
              <CardHeader title="Order summary" subtitle={`${cart.length} line${cart.length === 1 ? '' : 's'}`} />
              <CardBody>
                <div className="stack stack--gap-sm">
                  {cart.map((line) => (
                    <div className="cell-inline" key={line.productId}>
                      <Thumb label={line.name} accent={line.accent} />
                      <div className="cell-stack grow">
                        <span className="row-primary">{line.name}</span>
                        <span className="cell-sub">
                          {line.qty} × {formatCurrency(line.unitPrice, currency)}
                        </span>
                      </div>
                      <span className="strong nowrap">{formatCurrency(line.unitPrice * line.qty, currency)}</span>
                    </div>
                  ))}
                </div>
              </CardBody>
              <div className="card-footer" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 12 }}>
                <form className="stack stack--gap-sm" onSubmit={handleCoupon}>
                  <div className="row row--gap">
                    <TextInput value={couponCode} onChange={(event) => setCouponCode(event.target.value.toUpperCase())} placeholder="Coupon code" aria-label="Coupon code" invalid={Boolean(couponError)} />
                    <Button variant="secondary" type="submit" loading={applyingCoupon} disabled={Boolean(coupon)}>
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
                  ) : null}
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
                    <span className="label">Tax</span>
                    <span>{formatCurrency(totals.tax, currency)}</span>
                  </div>
                  <div className="cart-summary-row cart-summary-row--total">
                    <span>Total</span>
                    <span>{formatCurrency(totals.total, currency)}</span>
                  </div>
                </div>

                {submitError ? <Alert tone="danger" title="Could not place order">{submitError}</Alert> : null}

                <Button variant="primary" block icon="creditCard" loading={submitting} onClick={placeOrder}>
                  Place demo order
                </Button>
                <span className="dim center">No real payment is taken. This creates an in-memory order and decrements stock.</span>
              </div>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
