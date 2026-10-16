// Application-wide state: store settings, theme, shopping cart, applied coupon
// and the toast queue. Kept dependency-free and persisted to localStorage so a
// reload keeps the operator's context without re-fetching anything avoidable.

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { apiRequest, ApiError } from '../lib/api';
import type { Settings, ThemePreference } from '../data/types';
import type { AppliedCoupon } from '../data/pricing';

const THEME_KEY = 'northstar.theme';
const CART_KEY = 'northstar.cart';

export interface CartLine {
  productId: string;
  name: string;
  sku: string;
  unitPrice: number;
  accent: string;
  stock: number;
  qty: number;
}

export type ToastTone = 'success' | 'error' | 'info';

export interface Toast {
  id: string;
  tone: ToastTone;
  title: string;
  text?: string;
}

export interface ToastInput {
  tone?: ToastTone;
  title: string;
  text?: string;
}

interface AppContextValue {
  settings: Settings | null;
  settingsLoading: boolean;
  currency: string;
  storeName: string;
  reloadSettings: () => void;
  updateSettings: (patch: Partial<Settings>) => Promise<Settings>;
  theme: ThemePreference;
  setTheme: (theme: ThemePreference) => void;
  toggleTheme: () => void;

  cart: CartLine[];
  cartCount: number;
  cartSubtotal: number;
  addToCart: (line: Omit<CartLine, 'qty'>, qty?: number) => void;
  setLineQty: (productId: string, qty: number) => void;
  removeLine: (productId: string) => void;
  clearCart: () => void;

  coupon: AppliedCoupon | null;
  couponDiscount: number;
  applyCoupon: (code: string, subtotal: number) => Promise<AppliedCoupon>;
  clearCoupon: () => void;

  toasts: Toast[];
  pushToast: (input: ToastInput) => void;
  dismissToast: (id: string) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

function readStored<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeStored(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage may be unavailable — the demo still works in-memory */
  }
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [nonce, setNonce] = useState(0);

  const [theme, setThemeState] = useState<ThemePreference>(() => {
    const stored = readStored<ThemePreference | null>(THEME_KEY, null);
    if (stored === 'light' || stored === 'dark') return stored;
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  // Whether the operator has an explicitly stored preference. Captured once, at
  // mount, because the persist effect below writes on first render and would
  // otherwise make it look like a choice had already been made.
  const [hadStoredTheme] = useState(() => {
    const stored = readStored<ThemePreference | null>(THEME_KEY, null);
    return stored === 'light' || stored === 'dark';
  });

  const [cart, setCart] = useState<CartLine[]>(() => readStored<CartLine[]>(CART_KEY, []));
  const [coupon, setCoupon] = useState<AppliedCoupon | null>(null);
  const [couponDiscount, setCouponDiscount] = useState(0);
  const [toasts, setToasts] = useState<Toast[]>([]);

  // Load settings once, and whenever reloadSettings() bumps the nonce.
  useEffect(() => {
    let cancelled = false;
    setSettingsLoading(true);
    apiRequest<{ item: Settings }>('/api/settings')
      .then((result) => {
        if (cancelled) return;
        setSettings(result.item);
      })
      .catch(() => {
        /* the shell renders with sensible fallbacks if settings are unavailable */
      })
      .finally(() => {
        if (!cancelled) setSettingsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [nonce]);

  const reloadSettings = useCallback(() => setNonce((value) => value + 1), []);

  // Adopt the server's theme if the operator has never picked one explicitly.
  useEffect(() => {
    if (!settings) return;
    if (!hadStoredTheme && (settings.theme === 'light' || settings.theme === 'dark')) {
      setThemeState(settings.theme);
    }
  }, [settings, hadStoredTheme]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    writeStored(THEME_KEY, theme);
  }, [theme]);

  useEffect(() => {
    writeStored(CART_KEY, cart);
  }, [cart]);

  const setTheme = useCallback((next: ThemePreference) => setThemeState(next), []);
  const toggleTheme = useCallback(() => setThemeState((current) => (current === 'dark' ? 'light' : 'dark')), []);

  const updateSettings = useCallback(async (patch: Partial<Settings>): Promise<Settings> => {
    const result = await apiRequest<{ item: Settings }>('/api/settings', { method: 'PUT', body: patch });
    setSettings(result.item);
    return result.item;
  }, []);

  const pushToast = useCallback((input: ToastInput) => {
    const id = `tst_${Math.random().toString(36).slice(2, 9)}`;
    const toast: Toast = { id, tone: input.tone ?? 'info', title: input.title, text: input.text };
    setToasts((current) => [...current, toast]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((entry) => entry.id !== id));
    }, 4200);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((current) => current.filter((entry) => entry.id !== id));
  }, []);

  const addToCart = useCallback((line: Omit<CartLine, 'qty'>, qty = 1) => {
    setCart((current) => {
      const existing = current.find((entry) => entry.productId === line.productId);
      if (existing) {
        return current.map((entry) =>
          entry.productId === line.productId
            ? { ...entry, qty: Math.min(entry.qty + qty, Math.max(1, entry.stock)) }
            : entry
        );
      }
      return [...current, { ...line, qty: Math.max(1, Math.min(qty, Math.max(1, line.stock))) }];
    });
  }, []);

  const setLineQty = useCallback((productId: string, qty: number) => {
    setCart((current) =>
      current
        .map((entry) =>
          entry.productId === productId ? { ...entry, qty: Math.max(0, Math.min(qty, Math.max(0, entry.stock))) } : entry
        )
        .filter((entry) => entry.qty > 0)
    );
  }, []);

  const removeLine = useCallback((productId: string) => {
    setCart((current) => current.filter((entry) => entry.productId !== productId));
  }, []);

  const clearCart = useCallback(() => {
    setCart([]);
    setCoupon(null);
    setCouponDiscount(0);
  }, []);

  const applyCoupon = useCallback(async (code: string, subtotal: number): Promise<AppliedCoupon> => {
    const result = await apiRequest<{ coupon: AppliedCoupon & { discount: number } }>('/api/storefront/coupon', {
      method: 'POST',
      body: { code, subtotal },
    });
    const applied: AppliedCoupon = {
      code: result.coupon.code,
      label: result.coupon.label,
      type: result.coupon.type,
      value: result.coupon.value,
      minSubtotal: result.coupon.minSubtotal,
    };
    setCoupon(applied);
    setCouponDiscount(result.coupon.discount);
    return applied;
  }, []);

  const clearCoupon = useCallback(() => {
    setCoupon(null);
    setCouponDiscount(0);
  }, []);

  const cartCount = useMemo(() => cart.reduce((sum, line) => sum + line.qty, 0), [cart]);
  const cartSubtotal = useMemo(
    () => Math.round(cart.reduce((sum, line) => sum + line.qty * line.unitPrice, 0) * 100) / 100,
    [cart]
  );

  const value = useMemo<AppContextValue>(
    () => ({
      settings,
      settingsLoading,
      currency: settings?.currency ?? 'USD',
      storeName: settings?.storeName ?? 'Northstar Commerce',
      reloadSettings,
      updateSettings,
      theme,
      setTheme,
      toggleTheme,
      cart,
      cartCount,
      cartSubtotal,
      addToCart,
      setLineQty,
      removeLine,
      clearCart,
      coupon,
      couponDiscount,
      applyCoupon,
      clearCoupon,
      toasts,
      pushToast,
      dismissToast,
    }),
    [
      settings,
      settingsLoading,
      reloadSettings,
      updateSettings,
      theme,
      setTheme,
      toggleTheme,
      cart,
      cartCount,
      cartSubtotal,
      addToCart,
      setLineQty,
      removeLine,
      clearCart,
      coupon,
      couponDiscount,
      applyCoupon,
      clearCoupon,
      toasts,
      pushToast,
      dismissToast,
    ]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const value = useContext(AppContext);
  if (!value) throw new Error('useApp must be used inside <AppProvider>.');
  return value;
}

/** Convenience hook so components can notify without pulling the whole context. */
export function useToast(): (input: ToastInput) => void {
  return useApp().pushToast;
}

/** Formats an error thrown by the API client into a short, human message. */
export function describeError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.isNetworkError()) return 'The API server did not respond. Is it running on port 4000?';
    return error.message;
  }
  if (error instanceof Error) return error.message;
  return 'Something went wrong.';
}
