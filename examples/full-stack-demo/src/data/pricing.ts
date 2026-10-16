// Shared pricing rules used by BOTH the Express backend and the browser bundle.
// Kept free of seed data so the frontend never ships the full demo dataset.

import type { OrderItem } from './types';

export const TAX_RATE = 0.0825;
export const FREE_SHIPPING_THRESHOLD = 75;
export const FLAT_SHIPPING = 6.95;

export interface OrderTotals {
  subtotal: number;
  shipping: number;
  tax: number;
  total: number;
}

export interface AppliedCoupon {
  code: string;
  label: string;
  type: 'percent' | 'fixed';
  value: number;
  minSubtotal?: number;
}

export interface CheckoutTotals extends OrderTotals {
  discount: number;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function computeOrderTotals(items: OrderItem[]): OrderTotals {
  const subtotal = round2(items.reduce((sum, item) => sum + item.qty * item.unitPrice, 0));
  const shipping = subtotal >= FREE_SHIPPING_THRESHOLD || subtotal === 0 ? 0 : FLAT_SHIPPING;
  const tax = round2(subtotal * TAX_RATE);
  return { subtotal, shipping, tax, total: round2(subtotal + shipping + tax) };
}

export function couponDiscount(subtotal: number, coupon: AppliedCoupon | null): number {
  if (!coupon) return 0;
  if (coupon.type === 'percent') return round2(subtotal * (coupon.value / 100));
  return round2(Math.min(coupon.value, subtotal));
}

export function computeCheckoutTotals(items: OrderItem[], coupon: AppliedCoupon | null): CheckoutTotals {
  const totals = computeOrderTotals(items);
  const discount = couponDiscount(totals.subtotal, coupon);
  return { ...totals, discount, total: Math.max(0, round2(totals.total - discount)) };
}
