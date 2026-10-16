// Deterministic, fictional seed data + analytics for the Northstar Commerce demo.
//
// This module is intentionally dependency-free (no Node APIs, no React) so that
// the Express backend and the Vitest suite can both import it. All records are
// entirely fictional: names, emails (@example.com), phone numbers (555-01xx)
// and addresses are synthetically generated from a fixed pseudo-random seed.

import { computeOrderTotals, FLAT_SHIPPING, FREE_SHIPPING_THRESHOLD, TAX_RATE } from './pricing';
import type {
  ActivityItem,
  Address,
  Category,
  Channel,
  ChannelStat,
  Customer,
  CustomerSegment,
  MetricSummary,
  Order,
  OrderEvent,
  OrderItem,
  OrderStatus,
  Product,
  ProductPerformance,
  ProductStatus,
  RangeKey,
  SeriesPoint,
  Settings,
  StatusStat,
  Store,
} from './types';

export { computeOrderTotals, FLAT_SHIPPING, FREE_SHIPPING_THRESHOLD, TAX_RATE } from './pricing';

export const RANGE_DAYS: Record<RangeKey, number> = { '7d': 7, '30d': 30, '90d': 90 };

export const CHANNEL_LABELS: Record<Channel, string> = {
  web: 'Web store',
  marketplace: 'Marketplace',
  pos: 'Retail POS',
  social: 'Social commerce',
};

export const STATUS_LABELS: Record<OrderStatus, string> = {
  processing: 'Processing',
  shipped: 'Shipped',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

export const SEGMENT_LABELS: Record<CustomerSegment, string> = {
  vip: 'VIP',
  returning: 'Returning',
  new: 'New',
  'at-risk': 'At risk',
};

// ---------------------------------------------------------------------------
// Deterministic pseudo-random generator (mulberry32)
// ---------------------------------------------------------------------------
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function pick<T>(rnd: () => number, list: readonly T[]): T {
  return list[Math.floor(rnd() * list.length)] as T;
}

function between(rnd: () => number, min: number, max: number): number {
  return min + rnd() * (max - min);
}

function intBetween(rnd: () => number, min: number, max: number): number {
  return Math.floor(between(rnd, min, max + 1));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

// ---------------------------------------------------------------------------
// Catalogue + customer reference data
// ---------------------------------------------------------------------------
const CATEGORY_ROWS: ReadonlyArray<{ id: string; name: string; accent: string }> = [
  { id: 'cat_audio', name: 'Audio', accent: '#6366f1' },
  { id: 'cat_wearables', name: 'Wearables', accent: '#0ea5e9' },
  { id: 'cat_homeoffice', name: 'Home Office', accent: '#14b8a6' },
  { id: 'cat_lighting', name: 'Lighting', accent: '#f59e0b' },
  { id: 'cat_kitchen', name: 'Kitchen', accent: '#ef4444' },
  { id: 'cat_fitness', name: 'Fitness', accent: '#22c55e' },
  { id: 'cat_travel', name: 'Travel', accent: '#8b5cf6' },
  { id: 'cat_cameras', name: 'Cameras', accent: '#e11d48' },
  { id: 'cat_gaming', name: 'Gaming', accent: '#a855f7' },
  { id: 'cat_smarthome', name: 'Smart Home', accent: '#06b6d4' },
  { id: 'cat_outdoors', name: 'Outdoors', accent: '#65a30d' },
  { id: 'cat_accessories', name: 'Accessories', accent: '#64748b' },
];

const PRODUCT_ROWS: ReadonlyArray<{
  name: string;
  categoryId: string;
  price: number;
  cost: number;
  stock: number;
  reorderPoint: number;
  status: ProductStatus;
  rating: number;
  unitsSold: number;
  description: string;
}> = [
  { name: 'Northstar Studio Headphones', categoryId: 'cat_audio', price: 249, cost: 118, stock: 82, reorderPoint: 20, status: 'active', rating: 4.7, unitsSold: 612, description: 'Over-ear active noise cancelling headphones with a 38-hour battery.' },
  { name: 'Northstar Earbuds Pro', categoryId: 'cat_audio', price: 149, cost: 62, stock: 14, reorderPoint: 25, status: 'active', rating: 4.6, unitsSold: 934, description: 'Compact true-wireless earbuds with transparency mode and wireless charging.' },
  { name: 'Northstar Portable Speaker', categoryId: 'cat_audio', price: 89, cost: 39, stock: 143, reorderPoint: 30, status: 'active', rating: 4.4, unitsSold: 488, description: 'IP67 waterproof speaker tuned for outdoor listening.' },
  { name: 'Northstar Pulse Watch', categoryId: 'cat_wearables', price: 219, cost: 96, stock: 57, reorderPoint: 20, status: 'active', rating: 4.5, unitsSold: 401, description: 'GPS smartwatch with recovery scoring and 11-day battery life.' },
  { name: 'Northstar Fitness Band', categoryId: 'cat_wearables', price: 79, cost: 31, stock: 0, reorderPoint: 22, status: 'active', rating: 4.1, unitsSold: 756, description: 'Lightweight band tracking sleep, heart rate and workouts.' },
  { name: 'Northstar Standing Desk', categoryId: 'cat_homeoffice', price: 549, cost: 290, stock: 23, reorderPoint: 10, status: 'active', rating: 4.8, unitsSold: 188, description: 'Electric sit-stand desk with dual motors and four memory presets.' },
  { name: 'Northstar Ergonomic Chair', categoryId: 'cat_homeoffice', price: 429, cost: 210, stock: 31, reorderPoint: 12, status: 'active', rating: 4.6, unitsSold: 244, description: 'Mesh task chair with adjustable lumbar support and 4D armrests.' },
  { name: 'Northstar Desk Lamp', categoryId: 'cat_homeoffice', price: 59, cost: 22, stock: 96, reorderPoint: 24, status: 'active', rating: 4.3, unitsSold: 519, description: 'Flicker-free LED lamp with adjustable colour temperature.' },
  { name: 'Northstar Ambient Floor Lamp', categoryId: 'cat_lighting', price: 139, cost: 58, stock: 44, reorderPoint: 15, status: 'active', rating: 4.5, unitsSold: 297, description: 'Dimmable floor lamp with warm-to-cool ambient presets.' },
  { name: 'Northstar Smart Bulb Pack', categoryId: 'cat_lighting', price: 44, cost: 16, stock: 8, reorderPoint: 20, status: 'active', rating: 4.2, unitsSold: 1102, description: 'Four-pack of colour smart bulbs with schedules and scenes.' },
  { name: 'Northstar Precision Espresso', categoryId: 'cat_kitchen', price: 699, cost: 372, stock: 12, reorderPoint: 6, status: 'active', rating: 4.9, unitsSold: 132, description: 'Dual-boiler espresso machine with pressure profiling.' },
  { name: 'Northstar Sous Vide Cooker', categoryId: 'cat_kitchen', price: 119, cost: 47, stock: 63, reorderPoint: 18, status: 'active', rating: 4.4, unitsSold: 361, description: 'Precision immersion circulator with app-guided recipes.' },
  { name: 'Northstar Chef Knife Set', categoryId: 'cat_kitchen', price: 159, cost: 61, stock: 51, reorderPoint: 15, status: 'active', rating: 4.7, unitsSold: 268, description: 'Three-piece forged high-carbon steel knife set.' },
  { name: 'Northstar Adjustable Dumbbells', categoryId: 'cat_fitness', price: 329, cost: 158, stock: 19, reorderPoint: 10, status: 'active', rating: 4.6, unitsSold: 214, description: 'Pair of quick-adjust dumbbells spanning 2.5–24 kg each.' },
  { name: 'Northstar Yoga Mat Pro', categoryId: 'cat_fitness', price: 69, cost: 24, stock: 128, reorderPoint: 25, status: 'active', rating: 4.5, unitsSold: 587, description: 'Cushioned natural-rubber mat with alignment guides.' },
  { name: 'Northstar Carry-On Roller', categoryId: 'cat_travel', price: 189, cost: 82, stock: 37, reorderPoint: 12, status: 'active', rating: 4.4, unitsSold: 302, description: 'Cabin-size polycarbonate case with silent spinner wheels.' },
  { name: 'Northstar Travel Backpack', categoryId: 'cat_travel', price: 129, cost: 51, stock: 5, reorderPoint: 15, status: 'active', rating: 4.3, unitsSold: 449, description: 'Expandable 40L backpack with a dedicated laptop sleeve.' },
  { name: 'Northstar Action Camera', categoryId: 'cat_cameras', price: 279, cost: 141, stock: 26, reorderPoint: 12, status: 'active', rating: 4.5, unitsSold: 233, description: '4K60 action camera with stabilisation and waterproof housing.' },
  { name: 'Northstar Mirrorless Starter', categoryId: 'cat_cameras', price: 749, cost: 402, stock: 9, reorderPoint: 6, status: 'active', rating: 4.8, unitsSold: 97, description: '24MP mirrorless kit with a versatile 18–55mm lens.' },
  { name: 'Northstar Mechanical Keyboard', categoryId: 'cat_gaming', price: 139, cost: 55, stock: 74, reorderPoint: 20, status: 'active', rating: 4.7, unitsSold: 512, description: 'Hot-swappable 75% keyboard with per-key RGB.' },
  { name: 'Northstar Wireless Mouse', categoryId: 'cat_gaming', price: 79, cost: 28, stock: 118, reorderPoint: 24, status: 'active', rating: 4.5, unitsSold: 641, description: 'Lightweight 26k DPI wireless mouse with a 90-hour battery.' },
  { name: 'Northstar Video Doorbell', categoryId: 'cat_smarthome', price: 179, cost: 84, stock: 41, reorderPoint: 14, status: 'active', rating: 4.4, unitsSold: 279, description: '2K video doorbell with on-device person detection.' },
  { name: 'Northstar Trail Tent', categoryId: 'cat_outdoors', price: 239, cost: 112, stock: 17, reorderPoint: 8, status: 'active', rating: 4.6, unitsSold: 158, description: 'Two-person three-season tent weighing 2.1 kg.' },
  { name: 'Northstar USB-C Dock', categoryId: 'cat_accessories', price: 99, cost: 41, stock: 0, reorderPoint: 18, status: 'active', rating: 4.2, unitsSold: 688, description: '11-in-1 dock with dual 4K output and 100W passthrough.' },
];

const FIRST_NAMES = [
  'Amara', 'Bilal', 'Chloe', 'Dario', 'Elena', 'Farid', 'Grace', 'Hana', 'Ines', 'Jonas',
  'Keira', 'Lucas', 'Mira', 'Noor', 'Omar', 'Priya', 'Quinn', 'Rosa', 'Sami', 'Tara',
  'Umar', 'Vera', 'Wren', 'Xander', 'Yusuf', 'Zara', 'Anika', 'Bruno', 'Cora', 'Dmitri',
  'Elif', 'Felix', 'Gita', 'Hugo', 'Iris', 'Jonah',
];

const LAST_NAMES = [
  'Adeyemi', 'Bauer', 'Costa', 'Dubois', 'Eriksen', 'Fischer', 'Garcia', 'Haasan', 'Ivanov',
  'Jensen', 'Kowalski', 'Larsen', 'Mensah', 'Novak', 'Okafor', 'Petrov', 'Quintero', 'Rossi',
  'Silva', 'Tanaka', 'Ueda', 'Vargas', 'Weber', 'Xu', 'Yilmaz', 'Zhang', 'Abbas', 'Bello',
  'Chen', 'Diallo', 'Esposito', 'Fournier', 'Ghosh', 'Hoffmann', 'Iqbal', 'Jansen',
];

const COMPANIES = ['', '', '', 'Aurora Labs', 'Brightline Co', 'Cobalt Studio', 'Drift Retail', 'Ember Group', 'Fieldwork Inc', ''];

const CITIES: ReadonlyArray<{ city: string; region: string; country: string; postal: string }> = [
  { city: 'Portland', region: 'OR', country: 'United States', postal: '97205' },
  { city: 'Austin', region: 'TX', country: 'United States', postal: '78701' },
  { city: 'Denver', region: 'CO', country: 'United States', postal: '80202' },
  { city: 'Seattle', region: 'WA', country: 'United States', postal: '98101' },
  { city: 'Chicago', region: 'IL', country: 'United States', postal: '60601' },
  { city: 'Boston', region: 'MA', country: 'United States', postal: '02108' },
  { city: 'Toronto', region: 'ON', country: 'Canada', postal: 'M5H 2N2' },
  { city: 'Vancouver', region: 'BC', country: 'Canada', postal: 'V6B 1A1' },
  { city: 'Manchester', region: 'ENG', country: 'United Kingdom', postal: 'M1 1AE' },
  { city: 'Berlin', region: 'BE', country: 'Germany', postal: '10115' },
  { city: 'Amsterdam', region: 'NH', country: 'Netherlands', postal: '1011' },
  { city: 'Barcelona', region: 'CT', country: 'Spain', postal: '08001' },
];

const STREETS = ['Juniper Way', 'Harbor Street', 'Cedar Lane', 'Market Row', 'Willow Court', 'Foundry Road', 'Larkspur Ave', 'Quarry Street'];

const PAYMENT_METHODS = ['Visa •••• 4242', 'Mastercard •••• 1881', 'PayPal', 'Apple Pay', 'Klarna', 'Visa •••• 9021'];

const CHANNEL_WEIGHTS: ReadonlyArray<{ channel: Channel; weight: number }> = [
  { channel: 'web', weight: 0.54 },
  { channel: 'marketplace', weight: 0.2 },
  { channel: 'pos', weight: 0.16 },
  { channel: 'social', weight: 0.1 },
];

const DEFAULT_SETTINGS: Settings = {
  storeName: 'Northstar Commerce',
  supportEmail: 'support@northstar.example.com',
  currency: 'USD',
  timezone: 'America/Los_Angeles',
  lowStockThreshold: 20,
  notifyOrders: true,
  notifyStock: true,
  notifyWeekly: false,
  theme: 'light',
};

// ---------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------
function buildCategories(): Category[] {
  return CATEGORY_ROWS.map((row) => ({
    id: row.id,
    name: row.name,
    slug: row.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    accent: row.accent,
  }));
}

function buildProducts(now: Date): Product[] {
  return PRODUCT_ROWS.map((row, index) => {
    const category = CATEGORY_ROWS.find((c) => c.id === row.categoryId);
    return {
      id: `prd_${String(index + 1).padStart(3, '0')}`,
      sku: `NS-${row.categoryId.replace('cat_', '').slice(0, 3).toUpperCase()}-${String(index + 1).padStart(3, '0')}`,
      name: row.name,
      categoryId: row.categoryId,
      price: row.price,
      cost: row.cost,
      stock: row.stock,
      reorderPoint: row.reorderPoint,
      status: row.status,
      rating: row.rating,
      unitsSold: row.unitsSold,
      accent: category?.accent ?? '#6366f1',
      description: row.description,
      createdAt: isoDay(addDays(now, -intBetween(mulberry32(index + 7), 40, 700))),
    };
  });
}

function buildCustomers(now: Date): Customer[] {
  const rnd = mulberry32(20260416);
  const segmentPool: CustomerSegment[] = ['vip', 'returning', 'returning', 'new', 'at-risk', 'returning', 'vip', 'new'];
  const customers: Customer[] = [];
  for (let i = 0; i < 36; i++) {
    const first = FIRST_NAMES[i % FIRST_NAMES.length] as string;
    const last = LAST_NAMES[(i * 5 + 3) % LAST_NAMES.length] as string;
    const place = CITIES[i % CITIES.length] as (typeof CITIES)[number];
    const streetNo = intBetween(rnd, 12, 980);
    const street = pick(rnd, STREETS);
    const address: Address = {
      line1: `${streetNo} ${street}`,
      city: place.city,
      region: place.region,
      postalCode: place.postal,
      country: place.country,
    };
    customers.push({
      id: `cus_${String(i + 1).padStart(3, '0')}`,
      name: `${first} ${last}`,
      email: `${first.toLowerCase()}.${last.toLowerCase()}${i}@example.com`,
      phone: `+1 (555) 01${String(i).padStart(2, '0')}`,
      company: pick(rnd, COMPANIES),
      segment: segmentPool[i % segmentPool.length] as CustomerSegment,
      joinedAt: isoDay(addDays(now, -intBetween(rnd, 1, 720))),
      address,
      notes: i % 4 === 0 ? 'Prefers email updates. Enrolled in the loyalty programme.' : '',
    });
  }
  return customers;
}

function channelForRoll(roll: number): Channel {
  let cumulative = 0;
  for (const entry of CHANNEL_WEIGHTS) {
    cumulative += entry.weight;
    if (roll <= cumulative) return entry.channel;
  }
  return 'web';
}

function buildEvents(orderId: string, status: OrderStatus, createdAt: Date, rnd: () => number): OrderEvent[] {
  const events: OrderEvent[] = [];
  const push = (at: Date, label: string, detail: string, kind: OrderEvent['kind']) => {
    events.push({ id: `evt_${orderId}_${events.length + 1}`, at: at.toISOString(), label, detail, kind });
  };
  push(createdAt, 'Order created', 'Checkout completed and payment authorised.', 'info');
  push(addDays(createdAt, 0), 'Payment captured', pick(rnd, PAYMENT_METHODS), 'success');
  if (status === 'processing') {
    push(addDays(createdAt, 1), 'Preparing for fulfilment', 'Picking from the Portland fulfilment centre.', 'info');
  }
  if (status === 'shipped' || status === 'delivered') {
    push(addDays(createdAt, 1), 'Handed to carrier', 'Northstar Express — tracking NSX' + String(intBetween(rnd, 100000, 999999)), 'info');
  }
  if (status === 'delivered') {
    push(addDays(createdAt, 3), 'Delivered', 'Left with the recipient at the shipping address.', 'success');
  }
  if (status === 'cancelled') {
    push(addDays(createdAt, 1), 'Order cancelled', 'Cancelled at the customer’s request before dispatch.', 'warn');
    push(addDays(createdAt, 2), 'Refund issued', 'Refunded to the original payment method.', 'success');
  }
  return events;
}

function buildOrders(products: Product[], customers: Customer[], now: Date): Order[] {
  const rnd = mulberry32(913);
  const orders: Order[] = [];
  const total = 140;
  for (let i = 0; i < total; i++) {
    const createdAt = new Date(now.getTime() - between(rnd, 0, 89.5) * 24 * 60 * 60 * 1000);
    const ageDays = (now.getTime() - createdAt.getTime()) / (24 * 60 * 60 * 1000);
    const customer = pick(rnd, customers);
    const itemCount = intBetween(rnd, 1, 4);
    const chosen = new Set<string>();
    const items: OrderItem[] = [];
    for (let j = 0; j < itemCount; j++) {
      const product = pick(rnd, products);
      if (chosen.has(product.id)) continue;
      chosen.add(product.id);
      items.push({
        productId: product.id,
        name: product.name,
        sku: product.sku,
        qty: intBetween(rnd, 1, 3),
        unitPrice: product.price,
      });
    }
    const totals = computeOrderTotals(items);
    const roll = rnd();
    let status: OrderStatus;
    if (roll < 0.07) status = 'cancelled';
    else if (ageDays < 1) status = roll < 0.58 ? 'processing' : 'shipped';
    else if (ageDays < 4) status = roll < 0.32 ? 'processing' : 'shipped';
    else status = 'delivered';

    const channel = channelForRoll(rnd());
    const orderId = `NS-${String(26001 + i)}`;
    const address: Address = rnd() < 0.75 ? customer.address : {
      line1: `${intBetween(rnd, 12, 980)} ${pick(rnd, STREETS)}`,
      city: customer.address.city,
      region: customer.address.region,
      postalCode: customer.address.postalCode,
      country: customer.address.country,
    };
    orders.push({
      id: orderId,
      customerId: customer.id,
      createdAt: createdAt.toISOString(),
      status,
      channel,
      items,
      ...totals,
      paymentMethod: pick(rnd, PAYMENT_METHODS),
      shippingAddress: address,
      events: buildEvents(orderId, status, createdAt, rnd),
    });
  }
  return orders.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function buildSessions(now: Date): Record<string, number> {
  const rnd = mulberry32(4411);
  const sessions: Record<string, number> = {};
  for (let i = 0; i < 130; i++) {
    const day = isoDay(addDays(now, -i));
    const weekend = [0, 6].includes(addDays(now, -i).getUTCDay());
    sessions[day] = Math.round(between(rnd, weekend ? 320 : 420, weekend ? 640 : 980));
  }
  return sessions;
}

function buildActivity(store: Store, now: Date): ActivityItem[] {
  const items: ActivityItem[] = [];
  const recent = store.orders.slice(0, 8);
  for (const order of recent) {
    const customer = store.customers.find((c) => c.id === order.customerId);
    items.push({
      id: `act_${order.id}`,
      at: order.createdAt,
      kind: 'order',
      title: `Order ${order.id} — ${STATUS_LABELS[order.status]}`,
      detail: `${customer?.name ?? 'Unknown customer'} · ${order.items.length} item${order.items.length === 1 ? '' : 's'} · ${order.total.toFixed(2)}`,
    });
  }
  const lowStock = store.products.filter((p) => p.stock <= p.reorderPoint).slice(0, 3);
  for (const product of lowStock) {
    items.push({
      id: `act_stock_${product.id}`,
      at: addDays(now, -1).toISOString(),
      kind: 'stock',
      title: `Low stock — ${product.name}`,
      detail: `${product.stock} units remaining (reorder point ${product.reorderPoint}).`,
    });
  }
  items.push({
    id: 'act_system_payout',
    at: addDays(now, -1).toISOString(),
    kind: 'system',
    title: 'Payout scheduled',
    detail: 'Marketplace payout of $4,180.55 scheduled for settlement.',
  });
  return items.sort((a, b) => b.at.localeCompare(a.at));
}

export function buildStore(now: Date = new Date()): Store {
  const reference = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 12, 0, 0));
  const categories = buildCategories();
  const products = buildProducts(reference);
  const customers = buildCustomers(reference);
  const orders = buildOrders(products, customers, reference);
  const partial: Store = {
    categories,
    products,
    customers,
    orders,
    sessions: buildSessions(reference),
    settings: { ...DEFAULT_SETTINGS },
    activity: [],
  };
  partial.activity = buildActivity(partial, reference);
  return partial;
}

export function defaultSettings(): Settings {
  return { ...DEFAULT_SETTINGS };
}

// ---------------------------------------------------------------------------
// Analytics (all derived from the same in-memory orders for coherence)
// ---------------------------------------------------------------------------
function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

/** Half-open [startMs, endMs) window covering `days` calendar days ending today. */
export function rangeWindow(range: RangeKey, now: Date = new Date()): { startMs: number; endMs: number } {
  const days = RANGE_DAYS[range];
  const start = startOfUtcDay(addDays(now, -(days - 1)));
  const end = startOfUtcDay(addDays(now, 1));
  return { startMs: start.getTime(), endMs: end.getTime() };
}

export function ordersInRange(store: Store, range: RangeKey, now: Date = new Date()): Order[] {
  const { startMs, endMs } = rangeWindow(range, now);
  return ordersBetween(store, startMs, endMs);
}

function ordersBetween(store: Store, startMs: number, endMs: number): Order[] {
  return store.orders.filter((order) => {
    const at = new Date(order.createdAt).getTime();
    return at >= startMs && at < endMs;
  });
}

interface WindowSummary {
  /** Revenue recognised in the window (cancelled orders excluded). */
  revenue: number;
  /** Orders placed in the window, including cancellations. */
  orders: number;
  /** Units shipped in the window (cancelled orders excluded). */
  units: number;
  /** Revenue divided by fulfilled (non-cancelled) orders. */
  aov: number;
  /** Orders placed divided by recorded sessions, as a percentage. */
  conversionRate: number;
}

function summarize(store: Store, startMs: number, endMs: number): WindowSummary {
  const placed = ordersBetween(store, startMs, endMs);
  const fulfilled = placed.filter((order) => order.status !== 'cancelled');
  const revenue = round2(fulfilled.reduce((sum, order) => sum + order.total, 0));
  const units = fulfilled.reduce((sum, order) => sum + order.items.reduce((s, i) => s + i.qty, 0), 0);
  let sessions = 0;
  for (let cursor = startOfUtcDay(new Date(startMs)); cursor.getTime() < endMs; cursor = addDays(cursor, 1)) {
    sessions += store.sessions[isoDay(cursor)] ?? 0;
  }
  return {
    revenue,
    orders: placed.length,
    units,
    aov: fulfilled.length ? round2(revenue / fulfilled.length) : 0,
    conversionRate: sessions ? Math.round((placed.length / sessions) * 1000) / 10 : 0,
  };
}

function percentDelta(current: number, previous: number): number {
  if (previous === 0) return current === 0 ? 0 : 100;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

export function getMetricSummary(store: Store, range: RangeKey, now: Date = new Date()): MetricSummary {
  const current = rangeWindow(range, now);
  const spanMs = current.endMs - current.startMs;
  const currentSummary = summarize(store, current.startMs, current.endMs);
  const previousSummary = summarize(store, current.startMs - spanMs, current.startMs);
  return {
    ...currentSummary,
    revenueDelta: percentDelta(currentSummary.revenue, previousSummary.revenue),
    ordersDelta: percentDelta(currentSummary.orders, previousSummary.orders),
    aovDelta: percentDelta(currentSummary.aov, previousSummary.aov),
    conversionDelta: percentDelta(currentSummary.conversionRate, previousSummary.conversionRate),
  };
}

function bucketForRange(range: RangeKey): 'day' | 'week' {
  return range === '90d' ? 'week' : 'day';
}

/**
 * Revenue series for the range. Daily buckets for 7d/30d, weekly for 90d.
 * Buckets tile the range window exactly, so the series total always equals the
 * revenue reported by getMetricSummary for the same range.
 */
export function getSalesSeries(store: Store, range: RangeKey, now: Date = new Date()): SeriesPoint[] {
  const { startMs, endMs } = rangeWindow(range, now);
  const stepMs = bucketForRange(range) === 'day' ? 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000;
  const buckets: SeriesPoint[] = [];
  for (let cursor = startMs; cursor < endMs; cursor += stepMs) {
    const bucketOrders = ordersBetween(store, cursor, Math.min(cursor + stepMs, endMs)).filter(
      (order) => order.status !== 'cancelled'
    );
    const start = new Date(cursor);
    buckets.push({
      iso: isoDay(start),
      label: start.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }),
      revenue: round2(bucketOrders.reduce((sum, order) => sum + order.total, 0)),
      orders: bucketOrders.length,
    });
  }
  return buckets;
}

export function getChannelStats(store: Store, range: RangeKey, now: Date = new Date()): ChannelStat[] {
  const orders = ordersInRange(store, range, now).filter((order) => order.status !== 'cancelled');
  const revenue = round2(orders.reduce((sum, order) => sum + order.total, 0));
  return (Object.keys(CHANNEL_LABELS) as Channel[]).map((channel) => {
    const channelOrders = orders.filter((order) => order.channel === channel);
    const channelRevenue = round2(channelOrders.reduce((sum, order) => sum + order.total, 0));
    return {
      channel,
      label: CHANNEL_LABELS[channel],
      revenue: channelRevenue,
      orders: channelOrders.length,
      share: revenue ? Math.round((channelRevenue / revenue) * 1000) / 10 : 0,
    };
  });
}

export function getProductPerformance(
  store: Store,
  range: RangeKey,
  now: Date = new Date(),
  limit = 100
): ProductPerformance[] {
  const orders = ordersInRange(store, range, now).filter((order) => order.status !== 'cancelled');
  const map = new Map<string, ProductPerformance>();
  for (const order of orders) {
    for (const item of order.items) {
      const product = store.products.find((p) => p.id === item.productId);
      const entry = map.get(item.productId) ?? {
        productId: item.productId,
        name: item.name,
        sku: item.sku,
        units: 0,
        revenue: 0,
        margin: 0,
      };
      entry.units += item.qty;
      entry.revenue = round2(entry.revenue + item.qty * item.unitPrice);
      if (product) entry.margin = Math.round(((product.price - product.cost) / product.price) * 1000) / 10;
      map.set(item.productId, entry);
    }
  }
  return Array.from(map.values())
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, limit);
}

export function getStatusStats(store: Store, range: RangeKey, now: Date = new Date()): StatusStat[] {
  const orders = ordersInRange(store, range, now);
  const total = orders.length;
  return (Object.keys(STATUS_LABELS) as OrderStatus[]).map((status) => {
    const count = orders.filter((order) => order.status === status).length;
    return {
      status,
      label: STATUS_LABELS[status],
      count,
      share: total ? Math.round((count / total) * 1000) / 10 : 0,
    };
  });
}

export function getLowStock(store: Store, threshold?: number): Product[] {
  const limit = typeof threshold === 'number' ? threshold : store.settings.lowStockThreshold;
  return store.products
    .filter((product) => product.status === 'active' && product.stock <= Math.max(limit, product.reorderPoint))
    .sort((a, b) => a.stock - b.stock);
}

export function getTopProducts(store: Store, range: RangeKey, now: Date = new Date(), limit = 5): ProductPerformance[] {
  return getProductPerformance(store, range, now, limit);
}

export function getRecentOrders(store: Store, limit = 8): Order[] {
  return store.orders.slice(0, limit);
}

export function getActivity(store: Store, limit = 8): ActivityItem[] {
  return store.activity.slice(0, limit);
}

export function customerMetrics(store: Store, customerId: string): {
  orders: number;
  lifetimeValue: number;
  averageOrderValue: number;
  lastOrderAt: string | null;
} {
  const orders = store.orders.filter((order) => order.customerId === customerId && order.status !== 'cancelled');
  const lifetimeValue = round2(orders.reduce((sum, order) => sum + order.total, 0));
  return {
    orders: orders.length,
    lifetimeValue,
    averageOrderValue: orders.length ? round2(lifetimeValue / orders.length) : 0,
    lastOrderAt: orders.length ? orders.map((order) => order.createdAt).sort().reverse()[0] ?? null : null,
  };
}
