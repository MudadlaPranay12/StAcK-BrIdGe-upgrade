import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Server } from 'node:http';
import { createApp } from '../server';

let server: Server;
let base = '';

async function api(pathname: string, init?: RequestInit): Promise<{ status: number; body: any; headers: Headers }> {
  const res = await fetch(`${base}${pathname}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  let body: any = null;
  const text = await res.text();
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: res.status, body, headers: res.headers };
}

beforeAll(async () => {
  const app = createApp();
  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', () => resolve());
  });
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  base = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe('Northstar API', () => {
  it('reports health with a correlation id and echoes the trace id', async () => {
    const res = await api('/api/health', { headers: { 'X-DevBridge-Trace-Id': 'trc_test_123' } });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.correlationId).toMatch(/^cor_/);
    expect(res.body.traceId).toBe('trc_test_123');
    expect(res.headers.get('x-correlation-id')).toBe(res.body.correlationId);
  });

  it('serves a paginated, filterable product catalogue', async () => {
    const res = await api('/api/products?pageSize=10&page=1');
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(10);
    expect(res.body.total).toBe(24);
    expect(res.body.pageCount).toBe(3);

    const filtered = await api('/api/products?category=cat_audio');
    expect(filtered.body.total).toBe(3);
  });

  it('validates new products and rejects bad payloads with field detail', async () => {
    const invalid = await api('/api/products', {
      method: 'POST',
      body: JSON.stringify({ name: '', sku: 'x', price: -4, cost: -1, stock: -2, categoryId: 'nope' }),
    });
    expect(invalid.status).toBe(400);
    expect(invalid.body.code).toBe('VALIDATION_ERROR');
    expect(Array.isArray(invalid.body.details)).toBe(true);
    expect(invalid.body.details.length).toBeGreaterThanOrEqual(4);

    const created = await api('/api/products', {
      method: 'POST',
      body: JSON.stringify({ name: 'Northstar Test Widget', sku: 'NS-TST-900', categoryId: 'cat_accessories', price: 19.5, cost: 8, stock: 12, reorderPoint: 4, status: 'active', description: 'Created by the API test suite.' }),
    });
    expect(created.status).toBe(200);
    expect(created.body.item.id).toMatch(/^prd_/);

    // Duplicate SKU is rejected.
    const duplicate = await api('/api/products', {
      method: 'POST',
      body: JSON.stringify({ name: 'Duplicate', sku: 'NS-TST-900', categoryId: 'cat_accessories', price: 1, cost: 1, stock: 1, reorderPoint: 1 }),
    });
    expect(duplicate.status).toBe(400);
  });

  it('refuses to drive stock below zero', async () => {
    const products = await api('/api/products?pageSize=50');
    const target = products.body.items.find((p: any) => p.stock === 0) ?? products.body.items[0];
    const res = await api(`/api/products/${target.id}/stock`, {
      method: 'POST',
      body: JSON.stringify({ delta: -1 }),
    });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('serves dashboard and analytics payloads whose totals reconcile', async () => {
    for (const range of ['7d', '30d', '90d']) {
      const overview = await api(`/api/overview?range=${range}`);
      expect(overview.status).toBe(200);
      const seriesTotal = Math.round(overview.body.series.reduce((sum: number, p: any) => sum + p.revenue, 0) * 100) / 100;
      expect(seriesTotal).toBe(overview.body.metrics.revenue);
      const statusTotal = overview.body.statuses.reduce((sum: number, s: any) => sum + s.count, 0);
      expect(statusTotal).toBe(overview.body.metrics.orders);

      const analytics = await api(`/api/analytics?range=${range}`);
      expect(analytics.status).toBe(200);
      expect(analytics.body.products.length).toBeGreaterThan(0);
    }
  });

  it('updates an order status and rejects an unknown status', async () => {
    const orders = await api('/api/orders?pageSize=5');
    const order = orders.body.items[0];
    const bad = await api(`/api/orders/${order.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'teleported' }) });
    expect(bad.status).toBe(400);

    const target = order.status === 'processing' ? 'shipped' : 'processing';
    const good = await api(`/api/orders/${order.id}`, { method: 'PATCH', body: JSON.stringify({ status: target }) });
    expect(good.status).toBe(200);
    expect(good.body.item.status).toBe(target);
    expect(good.body.item.events.at(-1).label).toContain(target);
  });

  it('creates a real order through the succeeding demo checkout path', async () => {
    const products = await api('/api/storefront/products');
    const product = products.body.items[0];
    const res = await api('/api/orders', {
      method: 'POST',
      body: JSON.stringify({
        customer: { name: 'Test Shopper', email: 'test.shopper@example.com' },
        address: { line1: '10 Test Way', city: 'Portland', region: 'OR', postalCode: '97205', country: 'United States' },
        items: [{ productId: product.id, qty: 1 }],
        couponCode: 'NORTHSTAR10',
      }),
    });
    expect(res.status).toBe(200);
    expect(res.body.order.id).toMatch(/^NS-\d+$/);
    expect(res.body.order.total).toBeLessThan(res.body.order.subtotal + res.body.order.shipping + res.body.order.tax);
  });

  it('validates coupons against the demo coupon table', async () => {
    const good = await api('/api/storefront/coupon', { method: 'POST', body: JSON.stringify({ code: 'northstar10', subtotal: 200 }) });
    expect(good.status).toBe(200);
    expect(good.body.coupon.discount).toBe(20);

    const missing = await api('/api/storefront/coupon', { method: 'POST', body: JSON.stringify({ code: 'NOPE', subtotal: 200 }) });
    expect(missing.status).toBe(404);

    const belowMinimum = await api('/api/storefront/coupon', { method: 'POST', body: JSON.stringify({ code: 'WELCOME5', subtotal: 10 }) });
    expect(belowMinimum.status).toBe(400);
  });

  it('persists and validates settings', async () => {
    const saved = await api('/api/settings', { method: 'PUT', body: JSON.stringify({ storeName: 'Northstar Test Store', currency: 'EUR', theme: 'dark' }) });
    expect(saved.status).toBe(200);
    expect(saved.body.item.storeName).toBe('Northstar Test Store');

    const bad = await api('/api/settings', { method: 'PUT', body: JSON.stringify({ currency: 'XYZ', supportEmail: 'not-an-email' }) });
    expect(bad.status).toBe(400);
    expect(bad.body.details.length).toBe(2);

    // restore
    await api('/api/settings/reset', { method: 'POST' });
  });

  describe('Debug Lab scenarios', () => {
    it('1. returns a healthy 200', async () => {
      const res = await api('/api/debug/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('healthy');
    });

    it('2. returns a controlled 400 with field details', async () => {
      const res = await api('/api/debug/validate', { method: 'POST', body: JSON.stringify({ email: 'bad', quantity: 0 }) });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
      expect(res.body.details).toHaveLength(2);
    });

    it('3. returns 401 without the demo header and 200 with it', async () => {
      const denied = await api('/api/debug/protected');
      expect(denied.status).toBe(401);
      expect(denied.body.code).toBe('UNAUTHORIZED');

      const allowed = await api('/api/debug/protected', { headers: { 'X-Demo-Auth': 'northstar-demo' } });
      expect(allowed.status).toBe(200);
    });

    it('4. returns a controlled 404', async () => {
      const res = await api('/api/debug/not-found');
      expect(res.status).toBe(404);
      expect(res.body.code).toBe('RESOURCE_NOT_FOUND');
    });

    it('5. returns a real 500 from an Express endpoint', async () => {
      const res = await api('/api/debug/crash');
      expect(res.status).toBe(500);
      expect(res.body.ok).toBe(false);
      expect(String(res.body.error)).toMatch(/undefined|profile/i);
    });

    it('6. completes a deliberately slow request', async () => {
      const res = await api('/api/debug/slow?ms=120');
      expect(res.status).toBe(200);
      expect(res.body.waitedMs).toBe(120);
    });

    it('8. preserves the original failing checkout endpoint', async () => {
      const res = await api('/api/checkout', { method: 'POST', body: JSON.stringify({}) });
      expect(res.status).toBe(500);
      expect(res.body.ok).toBe(false);
    });
  });
});
