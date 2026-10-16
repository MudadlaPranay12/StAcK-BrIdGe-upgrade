// Shared domain types for the Northstar Commerce demo.
// This module is type-only: importing it with `import type` is erased at
// compile time, so the browser bundle never ships the backend seed logic.

export type OrderStatus = 'processing' | 'shipped' | 'delivered' | 'cancelled';

export type Channel = 'web' | 'marketplace' | 'pos' | 'social';

export type ProductStatus = 'active' | 'draft' | 'archived';

export type CustomerSegment = 'vip' | 'returning' | 'new' | 'at-risk';

export type RangeKey = '7d' | '30d' | '90d';

export interface Category {
  id: string;
  name: string;
  slug: string;
  accent: string;
}

export interface Product {
  id: string;
  sku: string;
  name: string;
  categoryId: string;
  price: number;
  cost: number;
  stock: number;
  reorderPoint: number;
  status: ProductStatus;
  rating: number;
  unitsSold: number;
  accent: string;
  description: string;
  createdAt: string;
}

export interface Address {
  line1: string;
  city: string;
  region: string;
  postalCode: string;
  country: string;
}

export interface Customer {
  id: string;
  name: string;
  email: string;
  phone: string;
  company: string;
  segment: CustomerSegment;
  joinedAt: string;
  address: Address;
  notes: string;
}

export interface OrderItem {
  productId: string;
  name: string;
  sku: string;
  qty: number;
  unitPrice: number;
}

export type OrderEventKind = 'info' | 'success' | 'warn' | 'error';

export interface OrderEvent {
  id: string;
  at: string;
  label: string;
  detail: string;
  kind: OrderEventKind;
}

export interface Order {
  id: string;
  customerId: string;
  createdAt: string;
  status: OrderStatus;
  channel: Channel;
  items: OrderItem[];
  subtotal: number;
  shipping: number;
  tax: number;
  total: number;
  paymentMethod: string;
  shippingAddress: Address;
  events: OrderEvent[];
}

export interface ActivityItem {
  id: string;
  at: string;
  kind: 'order' | 'stock' | 'customer' | 'system';
  title: string;
  detail: string;
}

export type ThemePreference = 'light' | 'dark';

export interface Settings {
  storeName: string;
  supportEmail: string;
  currency: string;
  timezone: string;
  lowStockThreshold: number;
  notifyOrders: boolean;
  notifyStock: boolean;
  notifyWeekly: boolean;
  theme: ThemePreference;
}

export interface Store {
  categories: Category[];
  products: Product[];
  customers: Customer[];
  orders: Order[];
  sessions: Record<string, number>;
  settings: Settings;
  activity: ActivityItem[];
}

export interface MetricSummary {
  revenue: number;
  orders: number;
  units: number;
  aov: number;
  conversionRate: number;
  revenueDelta: number;
  ordersDelta: number;
  aovDelta: number;
  conversionDelta: number;
}

export interface SeriesPoint {
  iso: string;
  label: string;
  revenue: number;
  orders: number;
}

export interface ChannelStat {
  channel: Channel;
  label: string;
  revenue: number;
  orders: number;
  share: number;
}

export interface ProductPerformance {
  productId: string;
  name: string;
  sku: string;
  units: number;
  revenue: number;
  margin: number;
}

export interface StatusStat {
  status: OrderStatus;
  label: string;
  count: number;
  share: number;
}
