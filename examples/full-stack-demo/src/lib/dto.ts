// Response shapes returned by the Northstar API, mirroring server.ts exactly.
// Kept in a client-only module so the browser bundle never imports seed logic.

import type {
  ActivityItem,
  Category,
  ChannelStat,
  Customer,
  MetricSummary,
  Order,
  Product,
  ProductPerformance,
  RangeKey,
  SeriesPoint,
  Settings,
  StatusStat,
} from '../data/types';

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

export interface CategoryWithCount extends Category {
  productCount: number;
}

export interface CustomerMetrics {
  orders: number;
  lifetimeValue: number;
  averageOrderValue: number;
  lastOrderAt: string | null;
}

export interface OrderRow extends Order {
  customer: Customer | null;
}

export interface CustomerRow extends Customer {
  metrics: CustomerMetrics;
}

export interface ProductDetail {
  item: Product;
  category: Category | null;
  performance: ProductPerformance;
}

export interface OrderDetail {
  item: Order;
  customer: Customer | null;
  products: Array<Product | null>;
}

export interface CustomerDetail {
  item: Customer;
  orders: Order[];
  metrics: CustomerMetrics;
}

export interface OverviewData {
  range: RangeKey;
  metrics: MetricSummary;
  series: SeriesPoint[];
  channels: ChannelStat[];
  statuses: StatusStat[];
  recentOrders: OrderRow[];
  topProducts: ProductPerformance[];
  lowStock: Product[];
  activity: ActivityItem[];
  currency: string;
}

export interface AnalyticsData {
  range: RangeKey;
  metrics: MetricSummary;
  series: SeriesPoint[];
  channels: ChannelStat[];
  statuses: StatusStat[];
  products: ProductPerformance[];
  orders: number;
  currency: string;
}

export interface StorefrontData {
  items: Product[];
  categories: Category[];
  currency: string;
}

export interface CategoryListResponse {
  items: CategoryWithCount[];
}

export interface SettingsResponse {
  item: Settings;
}

/**
 * Cohesive colour per channel, used by the channel donut and legends so the
 * chart and the list always agree.
 */
export const CHANNEL_COLORS: Record<string, string> = {
  web: '#4f46e5',
  marketplace: '#0ea5e9',
  pos: '#15803d',
  social: '#7c3aed',
};
