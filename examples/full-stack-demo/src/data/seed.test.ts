import { describe, expect, it } from 'vitest';
import {
  FREE_SHIPPING_THRESHOLD,
  FLAT_SHIPPING,
  TAX_RATE,
  buildStore,
  computeOrderTotals,
  getChannelStats,
  getMetricSummary,
  getProductPerformance,
  getSalesSeries,
  getStatusStats,
  ordersInRange,
  rangeWindow,
} from './seed';
import type { RangeKey, Store } from './types';

const RANGES: RangeKey[] = ['7d', '30d', '90d'];
const NOW = new Date('2026-10-16T18:30:00.000Z');

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function store(): Store {
  return buildStore(NOW);
}

describe('Northstar seed dataset', () => {
  it('is deterministic for a fixed reference date', () => {
    expect(JSON.stringify(buildStore(NOW))).toBe(JSON.stringify(buildStore(NOW)));
  });

  it('generates a coherent catalogue, customers and orders', () => {
    const s = store();
    expect(s.categories).toHaveLength(12);
    expect(s.products).toHaveLength(24);
    expect(s.customers).toHaveLength(36);
    expect(s.orders).toHaveLength(140);
    for (const order of s.orders) {
      expect(order.items.length).toBeGreaterThan(0);
      expect(s.customers.some((c) => c.id === order.customerId)).toBe(true);
      for (const item of order.items) {
        expect(s.products.some((p) => p.id === item.productId)).toBe(true);
      }
    }
  });

  it('computes every order total from its own line items', () => {
    const s = store();
    for (const order of s.orders) {
      const expected = computeOrderTotals(order.items);
      expect(order.subtotal).toBe(expected.subtotal);
      expect(order.shipping).toBe(expected.shipping);
      expect(order.tax).toBe(expected.tax);
      expect(order.total).toBe(expected.total);
      // Free-shipping / flat-shipping rule holds for every order.
      expect(order.shipping).toBe(order.subtotal >= FREE_SHIPPING_THRESHOLD ? 0 : FLAT_SHIPPING);
      expect(order.tax).toBe(round2(order.subtotal * TAX_RATE));
      expect(order.total).toBe(round2(order.subtotal + order.shipping + order.tax));
    }
  });

  it('uses only fictional customer domains and 555-01xx phone numbers', () => {
    for (const customer of store().customers) {
      expect(customer.email.endsWith('@example.com')).toBe(true);
      expect(customer.phone.startsWith('+1 (555) 01')).toBe(true);
    }
  });

  for (const range of RANGES) {
    it(`reconciles the ${range} dashboard totals across every view`, () => {
      const s = store();
      const summary = getMetricSummary(s, range, NOW);
      const series = getSalesSeries(s, range, NOW);
      const channels = getChannelStats(s, range, NOW);
      const statuses = getStatusStats(s, range, NOW);
      const products = getProductPerformance(s, range, NOW, 1000);

      // The chart total must equal the KPI revenue exactly.
      const seriesRevenue = round2(series.reduce((sum, point) => sum + point.revenue, 0));
      expect(seriesRevenue).toBe(summary.revenue);

      // Channel revenue must also sum to the same revenue, and shares to ~100%.
      const channelRevenue = round2(channels.reduce((sum, c) => sum + c.revenue, 0));
      expect(channelRevenue).toBe(summary.revenue);
      const shareTotal = Math.round(channels.reduce((sum, c) => sum + c.share, 0));
      if (summary.revenue > 0) expect(shareTotal).toBe(100);

      // Status distribution must account for every order placed in the window.
      const statusCount = statuses.reduce((sum, s2) => sum + s2.count, 0);
      expect(statusCount).toBe(summary.orders);
      expect(statusCount).toBe(ordersInRange(s, range, NOW).length);

      // Product performance is merchandise revenue: it must equal the sum of the
      // fulfilled orders' subtotals (i.e. revenue before shipping and tax).
      const merchandise = round2(products.reduce((sum, p) => sum + p.revenue, 0));
      const exploredSubtotals = round2(
        ordersInRange(s, range, NOW)
          .filter((order) => order.status !== 'cancelled')
          .reduce((sum, order) => sum + order.subtotal, 0)
      );
      expect(merchandise).toBe(exploredSubtotals);

      // Merchandise revenue can never exceed total revenue (shipping + tax added).
      expect(merchandise).toBeLessThanOrEqual(summary.revenue + 0.001);

      // The window is a clean tiling of calendar days.
      const window = rangeWindow(range, NOW);
      expect(window.endMs).toBeGreaterThan(window.startMs);
      expect((window.endMs - window.startMs) % (24 * 60 * 60 * 1000)).toBe(0);
    });
  }

  it('excludes cancelled orders from recognised revenue', () => {
    const s = store();
    const all = ordersInRange(s, '90d', NOW);
    const cancelled = all.filter((order) => order.status === 'cancelled');
    const expected = round2(
      all.filter((order) => order.status !== 'cancelled').reduce((sum, order) => sum + order.total, 0)
    );
    expect(getMetricSummary(s, '90d', NOW).revenue).toBe(expected);
    // A meaningful number of cancellations exist so the rule is actually exercised.
    expect(cancelled.length).toBeGreaterThan(0);
  });
});
