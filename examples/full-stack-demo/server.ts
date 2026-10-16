import express from 'express';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { devBridgeBackendTracer } from '@devbridge/backend-tracer';
import {
  FLAT_SHIPPING,
  buildStore,
  customerMetrics,
  defaultSettings,
  getActivity,
  getChannelStats,
  getLowStock,
  getMetricSummary,
  getProductPerformance,
  getRecentOrders,
  getSalesSeries,
  getStatusStats,
  ordersInRange,
} from './src/data/seed';
import { computeCheckoutTotals, couponDiscount, type AppliedCoupon } from './src/data/pricing';
import type {
  Category,
  Channel,
  Order,
  OrderItem,
  OrderStatus,
  Product,
  ProductStatus,
  RangeKey,
  Settings,
  Store,
} from './src/data/types';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// In-memory store (seeded, mutable). Reset by restarting the API process.
// ---------------------------------------------------------------------------
const store: Store = buildStore();

const VALID_STATUSES: OrderStatus[] = ['processing', 'shipped', 'delivered', 'cancelled'];
const VALID_PRODUCT_STATUSES: ProductStatus[] = ['active', 'draft', 'archived'];
const VALID_RANGES: RangeKey[] = ['7d', '30d', '90d'];
const VALID_CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'AUD'];

let nextOrderNumber = 26141;

interface Coupon {
  code: string;
  label: string;
  type: 'percent' | 'fixed';
  value: number;
  minSubtotal?: number;
}

const COUPONS: Record<string, Coupon> = {
  NORTHSTAR10: { code: 'NORTHSTAR10', label: '10% off your order', type: 'percent', value: 10 },
  WELCOME5: { code: 'WELCOME5', label: '$5 off orders over $25', type: 'fixed', value: 5, minSubtotal: 25 },
  FREESHIP: { code: 'FREESHIP', label: 'Free shipping', type: 'fixed', value: FLAT_SHIPPING, minSubtotal: 0 },
};

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeRange(value: unknown): RangeKey {
  return VALID_RANGES.includes(value as RangeKey) ? (value as RangeKey) : '30d';
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function asInt(value: unknown, fallback: number): number {
  const parsed = typeof value === 'string' ? Number.parseInt(value, 10) : Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------
interface FieldIssue {
  field: string;
  message: string;
}

function validateProductPayload(body: any, existingId?: string): { issues: FieldIssue[]; value?: Omit<Product, 'id' | 'createdAt'> } {
  const issues: FieldIssue[] = [];
  const name = asString(body?.name);
  const sku = asString(body?.sku).toUpperCase();
  const categoryId = asString(body?.categoryId);
  const description = asString(body?.description);
  const status = asString(body?.status || 'active') as ProductStatus;
  const price = Number(body?.price);
  const cost = Number(body?.cost);
  const stock = Number(body?.stock);
  const reorderPoint = Number(body?.reorderPoint);

  if (!name) issues.push({ field: 'name', message: 'Product name is required.' });
  else if (name.length > 120) issues.push({ field: 'name', message: 'Product name must be 120 characters or fewer.' });
  if (!sku) issues.push({ field: 'sku', message: 'SKU is required.' });
  else if (!/^[A-Z0-9-]{3,24}$/.test(sku)) issues.push({ field: 'sku', message: 'SKU must be 3–24 characters of A-Z, 0-9 or hyphen.' });
  else if (store.products.some((p) => p.sku === sku && p.id !== existingId)) issues.push({ field: 'sku', message: 'That SKU is already in use.' });
  if (!categoryId) issues.push({ field: 'categoryId', message: 'A category is required.' });
  else if (!store.categories.some((c) => c.id === categoryId)) issues.push({ field: 'categoryId', message: 'Unknown category.' });
  if (!Number.isFinite(price) || price < 0) issues.push({ field: 'price', message: 'Price must be zero or a positive number.' });
  if (!Number.isFinite(cost) || cost < 0) issues.push({ field: 'cost', message: 'Cost must be zero or a positive number.' });
  if (!Number.isFinite(stock) || !Number.isInteger(stock) || stock < 0) issues.push({ field: 'stock', message: 'Inventory must be a whole number of zero or more.' });
  if (!Number.isFinite(reorderPoint) || !Number.isInteger(reorderPoint) || reorderPoint < 0) issues.push({ field: 'reorderPoint', message: 'Reorder point must be a whole number of zero or more.' });
  if (!VALID_PRODUCT_STATUSES.includes(status)) issues.push({ field: 'status', message: `Status must be one of ${VALID_PRODUCT_STATUSES.join(', ')}.` });

  if (issues.length > 0) return { issues };

  const category = store.categories.find((c) => c.id === categoryId);
  return {
    issues: [],
    value: {
      sku,
      name,
      categoryId,
      price: Math.round(price * 100) / 100,
      cost: Math.round(cost * 100) / 100,
      stock: Math.trunc(stock),
      reorderPoint: Math.trunc(reorderPoint),
      status,
      rating: Number(body?.rating) || 0,
      unitsSold: Number(body?.unitsSold) || 0,
      accent: category?.accent ?? '#6366f1',
      description: description || 'No description provided yet.',
    },
  };
}

function pushActivity(kind: 'order' | 'stock' | 'customer' | 'system', title: string, detail: string): void {
  store.activity.unshift({ id: `act_${crypto.randomUUID()}`, at: nowIso(), kind, title, detail });
  if (store.activity.length > 40) store.activity.length = 40;
}

function orderSummaryPayload() {
  return {
    metrics: getMetricSummary(store, '30d'),
    lowStock: getLowStock(store),
    recentOrders: getRecentOrders(store, 6),
  };
}

// ---------------------------------------------------------------------------
// App factory
// ---------------------------------------------------------------------------
export function createApp(): express.Express {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  // Correlation + structured request logging. Every response echoes a
  // correlation id, and echoes the browser's StackBridge trace id when the
  // Vite runtime attached one, so the panel event and the API log line match.
  app.use((req, res, next) => {
    const correlationId = asString(req.headers['x-correlation-id']) || `cor_${crypto.randomUUID().slice(0, 12)}`;
    const traceId = asString(req.headers['x-devbridge-trace-id']) || null;
    res.locals.correlationId = correlationId;
    res.locals.traceId = traceId;
    res.setHeader('X-Correlation-Id', correlationId);
    if (traceId) res.setHeader('X-DevBridge-Trace-Id', traceId);
    const started = Date.now();
    res.on('finish', () => {
      const corr = String(res.locals.correlationId ?? correlationId);
      const trace = res.locals.traceId ? ` trace=${res.locals.traceId}` : '';
      // Never log request bodies: they may contain demo credentials or tokens.
      console.log(`[api] ${req.method} ${req.originalUrl} -> ${res.statusCode} corr=${corr}${trace} ${Date.now() - started}ms`);
    });
    next();
  });

  const meta = (res: express.Response) => ({
    correlationId: String(res.locals.correlationId ?? ''),
    traceId: (res.locals.traceId as string | null) ?? null,
  });

  const sendOk = (res: express.Response, payload: Record<string, unknown> = {}) => {
    res.json({ ok: true, ...meta(res), ...payload });
  };

  const sendError = (
    res: express.Response,
    status: number,
    code: string,
    message: string,
    details?: unknown
  ): void => {
    res.status(status).json({
      ok: false,
      ...meta(res),
      error: message,
      code,
      ...(details === undefined ? {} : { details }),
    });
  };

  // ---- Health ------------------------------------------------------------
  app.get('/api/health', (_req, res) => {
    sendOk(res, {
      service: 'northstar-commerce-api',
      version: '1.0.0',
      time: nowIso(),
      products: store.products.length,
      orders: store.orders.length,
      customers: store.customers.length,
    });
  });

  // ---- Catalogue ---------------------------------------------------------
  app.get('/api/categories', (_req, res) => {
    const categories = store.categories.map((category) => ({
      ...category,
      productCount: store.products.filter((p) => p.categoryId === category.id).length,
    }));
    sendOk(res, { items: categories });
  });

  app.get('/api/products', (req, res) => {
    const search = asString(req.query.search).toLowerCase();
    const category = asString(req.query.category);
    const status = asString(req.query.status);
    const sort = asString(req.query.sort) || 'name';
    const dir = asString(req.query.dir) === 'desc' ? -1 : 1;
    const page = Math.max(1, asInt(req.query.page, 1));
    const pageSize = Math.min(50, Math.max(5, asInt(req.query.pageSize, 10)));

    let items = store.products.slice();
    if (search) items = items.filter((p) => p.name.toLowerCase().includes(search) || p.sku.toLowerCase().includes(search));
    if (category && category !== 'all') items = items.filter((p) => p.categoryId === category);
    if (status && status !== 'all') items = items.filter((p) => p.status === status);

    items.sort((a, b) => {
      const key = sort as keyof Product;
      const left = a[key];
      const right = b[key];
      if (typeof left === 'number' && typeof right === 'number') return (left - right) * dir;
      return String(left).localeCompare(String(right)) * dir;
    });

    const total = items.length;
    const start = (page - 1) * pageSize;
    sendOk(res, {
      items: items.slice(start, start + pageSize),
      total,
      page,
      pageSize,
      pageCount: Math.max(1, Math.ceil(total / pageSize)),
    });
  });

  app.get('/api/products/:id', (req, res) => {
    const product = store.products.find((p) => p.id === req.params.id);
    if (!product) return sendError(res, 404, 'PRODUCT_NOT_FOUND', `No product with id ${req.params.id}.`);
    const sold = getProductPerformance(store, '90d', new Date(), 1000).find((p) => p.productId === product.id);
    sendOk(res, {
      item: product,
      category: store.categories.find((c) => c.id === product.categoryId) ?? null,
      performance: sold ?? { productId: product.id, name: product.name, sku: product.sku, units: 0, revenue: 0, margin: 0 },
    });
  });

  app.post('/api/products', (req, res) => {
    const { issues, value } = validateProductPayload(req.body);
    if (!value) return sendError(res, 400, 'VALIDATION_ERROR', 'The product could not be saved.', issues);
    const product: Product = { id: `prd_${crypto.randomUUID().slice(0, 8)}`, createdAt: nowIso().slice(0, 10), ...value };
    // Cadence: newest first among equals so new records surface at the top.
    store.products.unshift(product);
    pushActivity('stock', `Product created — ${product.name}`, `${product.stock} units stocked at $${product.price.toFixed(2)}.`);
    sendOk(res, { item: product });
  });

  app.put('/api/products/:id', (req, res) => {
    const index = store.products.findIndex((p) => p.id === req.params.id);
    if (index === -1) return sendError(res, 404, 'PRODUCT_NOT_FOUND', `No product with id ${req.params.id}.`);
    const { issues, value } = validateProductPayload(req.body, req.params.id);
    if (!value) return sendError(res, 400, 'VALIDATION_ERROR', 'The product could not be saved.', issues);
    const updated: Product = { ...store.products[index], ...value } as Product;
    store.products[index] = updated;
    sendOk(res, { item: updated });
  });

  app.delete('/api/products/:id', (req, res) => {
    const index = store.products.findIndex((p) => p.id === req.params.id);
    if (index === -1) return sendError(res, 404, 'PRODUCT_NOT_FOUND', `No product with id ${req.params.id}.`);
    const [removed] = store.products.splice(index, 1);
    pushActivity('stock', `Product archived — ${removed?.name ?? req.params.id}`, 'Removed from the active catalogue.');
    sendOk(res, { removedId: req.params.id });
  });

  app.post('/api/products/:id/stock', (req, res) => {
    const product = store.products.find((p) => p.id === req.params.id);
    if (!product) return sendError(res, 404, 'PRODUCT_NOT_FOUND', `No product with id ${req.params.id}.`);
    const delta = Number(req.body?.delta);
    if (!Number.isInteger(delta) || delta === 0) {
      return sendError(res, 400, 'VALIDATION_ERROR', 'Stock adjustment must be a non-zero whole number.', [
        { field: 'delta', message: 'Provide a non-zero whole number, for example 5 or -3.' },
      ]);
    }
    const next = product.stock + delta;
    if (next < 0) {
      return sendError(res, 400, 'VALIDATION_ERROR', 'Stock cannot become negative.', [
        { field: 'stock', message: `${product.name} has ${product.stock} units; ${Math.abs(delta)} cannot be removed.` },
      ]);
    }
    product.stock = next;
    pushActivity('stock', `Stock adjusted — ${product.name}`, `${delta > 0 ? '+' : ''}${delta} units → ${next} in stock.`);
    sendOk(res, { item: product });
  });

  // ---- Orders ------------------------------------------------------------
  app.get('/api/orders', (req, res) => {
    const search = asString(req.query.search).toLowerCase();
    const status = asString(req.query.status);
    const page = Math.max(1, asInt(req.query.page, 1));
    const pageSize = Math.min(50, Math.max(5, asInt(req.query.pageSize, 10)));

    let items = store.orders.slice();
    if (status && status !== 'all') items = items.filter((order) => order.status === status);
    if (search) {
      items = items.filter((order) => {
        if (order.id.toLowerCase().includes(search)) return true;
        const customer = store.customers.find((c) => c.id === order.customerId);
        return (customer?.name ?? '').toLowerCase().includes(search) || (customer?.email ?? '').toLowerCase().includes(search);
      });
    }
    const total = items.length;
    const start = (page - 1) * pageSize;
    sendOk(res, {
      items: items.slice(start, start + pageSize).map((order) => ({
        ...order,
        customer: store.customers.find((c) => c.id === order.customerId) ?? null,
      })),
      total,
      page,
      pageSize,
      pageCount: Math.max(1, Math.ceil(total / pageSize)),
    });
  });

  app.get('/api/orders/:id', (req, res) => {
    const order = store.orders.find((o) => o.id.toUpperCase() === req.params.id.toUpperCase());
    if (!order) return sendError(res, 404, 'ORDER_NOT_FOUND', `No order with id ${req.params.id}.`);
    sendOk(res, {
      item: order,
      customer: store.customers.find((c) => c.id === order.customerId) ?? null,
      products: order.items.map((item) => store.products.find((p) => p.id === item.productId) ?? null),
    });
  });

  app.patch('/api/orders/:id', (req, res) => {
    const order = store.orders.find((o) => o.id.toUpperCase() === req.params.id.toUpperCase());
    if (!order) return sendError(res, 404, 'ORDER_NOT_FOUND', `No order with id ${req.params.id}.`);
    const status = asString(req.body?.status) as OrderStatus;
    if (!VALID_STATUSES.includes(status)) {
      return sendError(res, 400, 'VALIDATION_ERROR', 'Unknown order status.', [
        { field: 'status', message: `Status must be one of ${VALID_STATUSES.join(', ')}.` },
      ]);
    }
    if (order.status === status) {
      return sendError(res, 409, 'NO_CHANGE', `Order ${order.id} is already ${status}.`);
    }
    order.status = status;
    order.events.push({
      id: `evt_${order.id}_${order.events.length + 1}`,
      at: nowIso(),
      label: `Status changed to ${status}`,
      detail: 'Updated manually from the Northstar operations console.',
      kind: status === 'cancelled' ? 'warn' : status === 'delivered' ? 'success' : 'info',
    });
    pushActivity('order', `Order ${order.id} → ${status}`, 'Status updated from the orders console.');
    sendOk(res, { item: order });
  });

  // ---- Customers ---------------------------------------------------------
  app.get('/api/customers', (req, res) => {
    const search = asString(req.query.search).toLowerCase();
    const segment = asString(req.query.segment);
    let items = store.customers.slice();
    if (segment && segment !== 'all') items = items.filter((c) => c.segment === segment);
    if (search) items = items.filter((c) => c.name.toLowerCase().includes(search) || c.email.toLowerCase().includes(search));
    sendOk(res, {
      items: items.map((customer) => ({ ...customer, metrics: customerMetrics(store, customer.id) })),
      total: items.length,
    });
  });

  app.get('/api/customers/:id', (req, res) => {
    const customer = store.customers.find((c) => c.id === req.params.id);
    if (!customer) return sendError(res, 404, 'CUSTOMER_NOT_FOUND', `No customer with id ${req.params.id}.`);
    const orders = store.orders.filter((order) => order.customerId === customer.id);
    sendOk(res, { item: customer, orders, metrics: customerMetrics(store, customer.id) });
  });

  // ---- Analytics / dashboard --------------------------------------------
  app.get('/api/overview', (req, res) => {
    const range = normalizeRange(req.query.range);
    sendOk(res, {
      range,
      metrics: getMetricSummary(store, range),
      series: getSalesSeries(store, range),
      channels: getChannelStats(store, range),
      statuses: getStatusStats(store, range),
      recentOrders: getRecentOrders(store, 8).map((order) => ({
        ...order,
        customer: store.customers.find((c) => c.id === order.customerId) ?? null,
      })),
      topProducts: getProductPerformance(store, range, new Date(), 5),
      lowStock: getLowStock(store),
      activity: getActivity(store, 7),
      currency: store.settings.currency,
    });
  });

  app.get('/api/analytics', (req, res) => {
    const range = normalizeRange(req.query.range);
    sendOk(res, {
      range,
      metrics: getMetricSummary(store, range),
      series: getSalesSeries(store, range),
      channels: getChannelStats(store, range),
      statuses: getStatusStats(store, range),
      products: getProductPerformance(store, range, new Date(), 100),
      orders: ordersInRange(store, range).length,
      currency: store.settings.currency,
    });
  });

  // ---- Settings ----------------------------------------------------------
  app.get('/api/settings', (_req, res) => {
    sendOk(res, { item: store.settings });
  });

  app.put('/api/settings', (req, res) => {
    const body = req.body ?? {};
    const issues: FieldIssue[] = [];
    const next: Settings = { ...store.settings };

    if (body.storeName !== undefined) {
      const storeName = asString(body.storeName);
      if (!storeName) issues.push({ field: 'storeName', message: 'Store name is required.' });
      else next.storeName = storeName;
    }
    if (body.supportEmail !== undefined) {
      const email = asString(body.supportEmail);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) issues.push({ field: 'supportEmail', message: 'Enter a valid email address.' });
      else next.supportEmail = email;
    }
    if (body.currency !== undefined) {
      const currency = asString(body.currency);
      if (!VALID_CURRENCIES.includes(currency)) issues.push({ field: 'currency', message: `Currency must be one of ${VALID_CURRENCIES.join(', ')}.` });
      else next.currency = currency;
    }
    if (body.timezone !== undefined) next.timezone = asString(body.timezone) || next.timezone;
    if (body.lowStockThreshold !== undefined) {
      const threshold = Number(body.lowStockThreshold);
      if (!Number.isInteger(threshold) || threshold < 0) issues.push({ field: 'lowStockThreshold', message: 'Low-stock threshold must be a whole number of zero or more.' });
      else next.lowStockThreshold = threshold;
    }
    if (body.notifyOrders !== undefined) next.notifyOrders = Boolean(body.notifyOrders);
    if (body.notifyStock !== undefined) next.notifyStock = Boolean(body.notifyStock);
    if (body.notifyWeekly !== undefined) next.notifyWeekly = Boolean(body.notifyWeekly);
    if (body.theme !== undefined) {
      if (body.theme !== 'light' && body.theme !== 'dark') issues.push({ field: 'theme', message: 'Theme must be light or dark.' });
      else next.theme = body.theme;
    }

    if (issues.length > 0) return sendError(res, 400, 'VALIDATION_ERROR', 'Settings could not be saved.', issues);
    Object.assign(store.settings, next);
    pushActivity('system', 'Settings updated', 'Store settings saved from the settings console.');
    sendOk(res, { item: store.settings });
  });

  app.post('/api/settings/reset', (_req, res) => {
    Object.assign(store.settings, defaultSettings());
    sendOk(res, { item: store.settings });
  });

  // ---- Storefront --------------------------------------------------------
  app.get('/api/storefront/products', (req, res) => {
    const search = asString(req.query.search).toLowerCase();
    const category = asString(req.query.category);
    let items = store.products.filter((p) => p.status === 'active');
    if (category && category !== 'all') items = items.filter((p) => p.categoryId === category);
    if (search) items = items.filter((p) => p.name.toLowerCase().includes(search) || p.description.toLowerCase().includes(search));
    sendOk(res, {
      items,
      categories: store.categories,
      currency: store.settings.currency,
    });
  });

  app.post('/api/storefront/coupon', (req, res) => {
    const code = asString(req.body?.code).toUpperCase();
    const subtotal = Number(req.body?.subtotal) || 0;
    if (!code) return sendError(res, 400, 'VALIDATION_ERROR', 'Enter a coupon code.', [{ field: 'code', message: 'Coupon code is required.' }]);
    const coupon = COUPONS[code];
    if (!coupon) return sendError(res, 404, 'COUPON_NOT_FOUND', `Coupon ${code} is not recognised.`, [{ field: 'code', message: 'That code is not active in this demo store.' }]);
    if (coupon.minSubtotal && subtotal < coupon.minSubtotal) {
      return sendError(res, 400, 'COUPON_MINIMUM', `This coupon needs a subtotal of at least ${coupon.minSubtotal}.`, [
        { field: 'code', message: `Add ${(coupon.minSubtotal - subtotal).toFixed(2)} more to qualify.` },
      ]);
    }
    const applied: AppliedCoupon = {
      code: coupon.code,
      label: coupon.label,
      type: coupon.type,
      value: coupon.value,
      minSubtotal: coupon.minSubtotal,
    };
    sendOk(res, { coupon: { ...applied, discount: couponDiscount(subtotal, applied) } });
  });

  // Creates a real (in-memory) order and decrements stock. This is the
  // succeeding demo checkout path. No payment details are ever collected.
  app.post('/api/orders', (req, res) => {
    const body = req.body ?? {};
    const issues: FieldIssue[] = [];
    const customerName = asString(body?.customer?.name);
    const email = asString(body?.customer?.email);
    const line1 = asString(body?.address?.line1);
    const city = asString(body?.address?.city);
    const postalCode = asString(body?.address?.postalCode);
    const rawItems: any[] = Array.isArray(body?.items) ? body.items : [];

    if (!customerName) issues.push({ field: 'name', message: 'Full name is required.' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) issues.push({ field: 'email', message: 'Enter a valid email address.' });
    if (!line1) issues.push({ field: 'line1', message: 'Address line 1 is required.' });
    if (!city) issues.push({ field: 'city', message: 'City is required.' });
    if (!postalCode) issues.push({ field: 'postalCode', message: 'Postal code is required.' });
    if (rawItems.length === 0) issues.push({ field: 'items', message: 'Your cart is empty.' });

    const items: OrderItem[] = [];
    for (const raw of rawItems) {
      const product = store.products.find((p) => p.id === asString(raw?.productId));
      const qty = Math.trunc(Number(raw?.qty));
      if (!product) {
        issues.push({ field: 'items', message: `Unknown product ${asString(raw?.productId)}.` });
        continue;
      }
      if (!Number.isInteger(qty) || qty < 1) {
        issues.push({ field: 'items', message: `Quantity for ${product.name} must be at least 1.` });
        continue;
      }
      if (qty > product.stock) {
        issues.push({ field: 'items', message: `Only ${product.stock} units of ${product.name} remain.` });
        continue;
      }
      items.push({ productId: product.id, name: product.name, sku: product.sku, qty, unitPrice: product.price });
    }

    if (issues.length > 0) return sendError(res, 400, 'VALIDATION_ERROR', 'Checkout could not be completed.', issues);

    const requestedCoupon = asString(body?.couponCode).toUpperCase();
    let appliedCoupon: AppliedCoupon | null = null;
    if (requestedCoupon) {
      const coupon = COUPONS[requestedCoupon];
      if (!coupon) return sendError(res, 400, 'COUPON_NOT_FOUND', `Coupon ${requestedCoupon} is not recognised.`);
      appliedCoupon = {
        code: coupon.code,
        label: coupon.label,
        type: coupon.type,
        value: coupon.value,
        minSubtotal: coupon.minSubtotal,
      };
    }

    const totals = computeCheckoutTotals(items, appliedCoupon);
    if (appliedCoupon?.minSubtotal && totals.subtotal < appliedCoupon.minSubtotal) {
      return sendError(res, 400, 'COUPON_MINIMUM', `Coupon ${appliedCoupon.code} needs a subtotal of at least ${appliedCoupon.minSubtotal}.`);
    }

    const discount = totals.discount;
    const couponCode = appliedCoupon?.code ?? null;
    const total = totals.total;
    const id = `NS-${nextOrderNumber++}`;
    const order: Order = {
      id,
      customerId: asString(body?.customer?.customerId) || 'guest',
      createdAt: nowIso(),
      status: 'processing',
      channel: 'web',
      items,
      subtotal: totals.subtotal,
      shipping: totals.shipping,
      tax: totals.tax,
      total,
      paymentMethod: 'Demo card •••• 4242',
      shippingAddress: {
        line1,
        city,
        region: asString(body?.address?.region) || '—',
        postalCode,
        country: asString(body?.address?.country) || 'United States',
      },
      events: [
        { id: `evt_${id}_1`, at: nowIso(), label: 'Order created', detail: 'Demo checkout submitted — no real payment was taken.', kind: 'info' },
        { id: `evt_${id}_2`, at: nowIso(), label: 'Payment simulated', detail: 'Demo card authorised in a sandbox.', kind: 'success' },
      ],
    };
    store.orders.unshift(order);
    for (const item of items) {
      const product = store.products.find((p) => p.id === item.productId);
      if (product) product.stock = Math.max(0, product.stock - item.qty);
    }
    pushActivity('order', `Order ${order.id} created`, `${items.length} item${items.length === 1 ? '' : 's'} · $${total.toFixed(2)}${couponCode ? ` · coupon ${couponCode}` : ''}`);
    sendOk(res, { order: { ...order, couponCode, discount } });
  });

  // ---- CHECKOUT (preserved end-to-end failure demo) ----------------------
  // Simulated failing route so you can test Frontend -> Backend stack trace correlation
  app.post('/api/checkout', (_req, res, next) => {
    try {
      const user: any = undefined;
      // Intentional crash on this exact line!
      console.log(user.profile.id);
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  // ---- Debug Lab scenarios (real HTTP against this process) --------------
  app.get('/api/debug/health', (_req, res) => {
    sendOk(res, {
      service: 'northstar-commerce-api',
      status: 'healthy',
      version: '1.0.0',
      uptimeSeconds: Math.round(process.uptime()),
      time: nowIso(),
    });
  });

  app.post('/api/debug/validate', (req, res) => {
    const email = asString(req.body?.email);
    const quantity = Number(req.body?.quantity);
    const issues: FieldIssue[] = [];
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) issues.push({ field: 'email', message: 'Enter a valid email address.' });
    if (!Number.isInteger(quantity) || quantity < 1) issues.push({ field: 'quantity', message: 'Quantity must be a whole number of at least 1.' });
    if (issues.length > 0) {
      return sendError(res, 400, 'VALIDATION_ERROR', 'The submitted payload failed validation.', issues);
    }
    sendOk(res, { accepted: { email, quantity } });
  });

  app.get('/api/debug/protected', (req, res) => {
    // Demo-only bearer check. Never a real credential; nothing is logged.
    if (asString(req.headers['x-demo-auth']) !== 'northstar-demo') {
      return sendError(res, 401, 'UNAUTHORIZED', 'This demo endpoint requires the X-Demo-Auth header.', [
        { field: 'x-demo-auth', message: 'Send the header value "northstar-demo" to succeed.' },
      ]);
    }
    sendOk(res, { scope: 'store:read', message: 'Authorised against the demo scope.' });
  });

  app.get('/api/debug/not-found', (req, res) => {
    sendError(res, 404, 'RESOURCE_NOT_FOUND', `No demo resource matches ${req.originalUrl}.`);
  });

  app.get('/api/debug/crash', (_req, _res, next) => {
    try {
      const payload: any = undefined;
      // Intentional crash: produces a real 500 and a StackBridge backend trace.
      console.log(payload.order.id);
      next(new Error('Unreachable after the intentional crash.'));
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/debug/slow', async (req, res) => {
    const ms = Math.min(15000, Math.max(100, asInt(req.query.ms, 2500)));
    await new Promise((resolve) => setTimeout(resolve, ms));
    sendOk(res, { waitedMs: ms, note: `This response was deliberately delayed by ${ms} ms.` });
  });

  app.get('/api/debug/timeout', async (req, res) => {
    const ms = Math.min(20000, Math.max(1000, asInt(req.query.ms, 12000)));
    await new Promise((resolve) => setTimeout(resolve, ms));
    if (res.writableEnded || res.headersSent) return; // client already aborted
    sendOk(res, { waitedMs: ms, note: 'The client should have aborted before this response was written.' });
  });

  // Wire the DevBridge Backend Tracer middleware AFTER routes
  app.use(
    devBridgeBackendTracer({
      agentUrl: 'http://127.0.0.1:4321',
      agentToken: process.env.DEVBRIDGE_TOKEN,
      backendRoot: __dirname,
    })
  );

  // Final Express error response
  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    sendError(res, 500, 'INTERNAL_ERROR', err.message || 'Unhandled backend error.');
  });

  return app;
}

export function startServer(port = 4000): ReturnType<express.Express['listen']> {
  const app = createApp();
  const server = app.listen(port, '127.0.0.1', () => {
    console.log(`[Demo Backend] Running at http://127.0.0.1:${port}`);
  });
  return server;
}

// Only auto-start outside the test runner so the Vitest suite can import
// createApp() and bind an ephemeral port of its own.
const underTest = Boolean(process.env.VITEST) || process.env.NODE_ENV === 'test';
if (!underTest) {
  startServer(4000);
}

export type { Category, Channel };
