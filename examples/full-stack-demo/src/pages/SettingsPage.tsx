import { useEffect, useState } from 'react';
import type { Settings, ThemePreference } from '../data/types';
import { ApiError, apiRequest } from '../lib/api';
import { useDocumentTitle, useTransientFlag } from '../lib/hooks';
import { useApp } from '../app/AppContext';
import { PageHeader } from '../components/layout/PageHeader';
import { Alert, Badge, Card, CardBody, CardHeader, KeyValue } from '../components/ui/Display';
import { Button } from '../components/ui/Button';
import { Field, SelectInput, Switch, TextInput } from '../components/ui/Form';
import { Segmented } from '../components/ui/Nav';
import { LoadingState } from '../components/ui/Feedback';

const CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'AUD'];

const TIMEZONES = [
  'America/Los_Angeles',
  'America/Denver',
  'America/Chicago',
  'America/New_York',
  'Europe/London',
  'Europe/Berlin',
  'Asia/Kolkata',
  'Asia/Tokyo',
  'Australia/Sydney',
];

type FieldErrors = Partial<Record<keyof Settings | 'form', string>>;

/** Three notification toggles that mirror the server's settings shape. */
function NotificationCard({ form, onChange }: { form: Settings; onChange: (patch: Partial<Settings>) => void }) {
  return (
    <Card>
      <CardHeader title="Notifications" subtitle="What this workspace should alert on" />
      <CardBody>
        <div className="stack stack--gap">
          <Switch
            id="notify-orders"
            checked={form.notifyOrders}
            onChange={(value) => onChange({ notifyOrders: value })}
            label="Email me when a new order is placed"
          />
          <Switch
            id="notify-stock"
            checked={form.notifyStock}
            onChange={(value) => onChange({ notifyStock: value })}
            label="Warn me when a product drops to its reorder point"
          />
          <Switch
            id="notify-weekly"
            checked={form.notifyWeekly}
            onChange={(value) => onChange({ notifyWeekly: value })}
            label="Send the weekly performance digest"
          />
        </div>
      </CardBody>
    </Card>
  );
}

export function SettingsPage() {
  useDocumentTitle('Settings — Northstar Commerce');
  const { settings, settingsLoading, updateSettings, reloadSettings, theme, setTheme, pushToast } = useApp();

  const [form, setForm] = useState<Settings | null>(settings);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [lastSaved, flashSaved] = useTransientFlag();

  // Adopt the server's settings the first time they arrive (and after a reset).
  useEffect(() => {
    setForm(settings);
  }, [settings]);

  function patch(next: Partial<Settings>) {
    setForm((current) => (current ? { ...current, ...next } : current));
  }

  async function save(): Promise<void> {
    if (!form) return;
    setSaving(true);
    setErrors({});
    try {
      await updateSettings({
        storeName: form.storeName,
        supportEmail: form.supportEmail,
        currency: form.currency,
        timezone: form.timezone,
        lowStockThreshold: form.lowStockThreshold,
        notifyOrders: form.notifyOrders,
        notifyStock: form.notifyStock,
        notifyWeekly: form.notifyWeekly,
        theme: form.theme,
      });
      setTheme(form.theme);
      flashSaved();
      pushToast({ tone: 'success', title: 'Settings saved', text: 'The workspace was updated.' });
    } catch (error) {
      if (error instanceof ApiError) {
        const next: FieldErrors = {};
        for (const issue of error.fieldIssues) {
          next[issue.field as keyof Settings] = issue.message;
        }
        if (Object.keys(next).length === 0) next.form = error.message;
        setErrors(next);
        pushToast({ tone: 'error', title: 'Could not save settings', text: error.message });
      } else {
        setErrors({ form: 'Unexpected error while saving.' });
      }
    } finally {
      setSaving(false);
    }
  }

  async function reset(): Promise<void> {
    setResetting(true);
    setErrors({});
    try {
      const result = await apiRequest<{ item: Settings }>('/api/settings/reset', { method: 'POST' });
      setForm(result.item);
      reloadSettings();
      pushToast({ tone: 'info', title: 'Settings reset', text: 'Defaults restored on the server.' });
    } catch (error) {
      pushToast({ tone: 'error', title: 'Reset failed', text: error instanceof Error ? error.message : 'Unknown error' });
    } finally {
      setResetting(false);
    }
  }

  if (settingsLoading && !settings) {
    return (
      <div className="page">
        <PageHeader eyebrow="Settings" title="Workspace settings" subtitle="Store identity, locale and notifications." />
        <LoadingState label="Loading settings…" />
      </div>
    );
  }

  if (!form) {
    return (
      <div className="page">
        <PageHeader eyebrow="Settings" title="Workspace settings" subtitle="Store identity, locale and notifications." />
        <Alert tone="danger" title="Settings unavailable">
          The workspace settings could not be loaded. Try reloading the page.
        </Alert>
      </div>
    );
  }

  return (
    <div className="page">
      <PageHeader
        eyebrow="Settings"
        title="Workspace settings"
        subtitle="Store identity, locale and notifications, persisted by the demo API."
        actions={
          <>
            <Button variant="ghost" icon="refresh" loading={resetting} onClick={() => void reset()}>
              Reset to defaults
            </Button>
            <Button variant="primary" icon="check" loading={saving} onClick={() => void save()}>
              Save changes
            </Button>
          </>
        }
      />

      {lastSaved ? <Alert tone="success" title="Saved">Your settings were stored on the server.</Alert> : null}
      {errors.form ? <Alert tone="danger" title="Save failed">{errors.form}</Alert> : null}

      <div className="grid grid--2">
        <Card>
          <CardHeader title="Store identity" subtitle="Shown across the console and storefront" />
          <CardBody>
            <form
              className="form-grid"
              onSubmit={(event) => {
                event.preventDefault();
                void save();
              }}
            >
              <Field label="Store name" htmlFor="store-name" required error={errors.storeName}>
                <TextInput
                  id="store-name"
                  value={form.storeName}
                  invalid={Boolean(errors.storeName)}
                  onChange={(event) => patch({ storeName: event.target.value })}
                />
              </Field>
              <Field label="Support email" htmlFor="support-email" required error={errors.supportEmail}>
                <TextInput
                  id="support-email"
                  type="email"
                  value={form.supportEmail}
                  invalid={Boolean(errors.supportEmail)}
                  onChange={(event) => patch({ supportEmail: event.target.value })}
                />
              </Field>
              <Field label="Currency" htmlFor="currency" error={errors.currency}>
                <SelectInput
                  id="currency"
                  value={form.currency}
                  invalid={Boolean(errors.currency)}
                  onChange={(event) => patch({ currency: event.target.value })}
                >
                  {CURRENCIES.map((code) => (
                    <option key={code} value={code}>
                      {code}
                    </option>
                  ))}
                </SelectInput>
              </Field>
              <Field label="Timezone" htmlFor="timezone" error={errors.timezone}>
                <SelectInput id="timezone" value={form.timezone} onChange={(event) => patch({ timezone: event.target.value })}>
                  {TIMEZONES.map((zone) => (
                    <option key={zone} value={zone}>
                      {zone}
                    </option>
                  ))}
                </SelectInput>
              </Field>
              <Field
                label="Low-stock threshold"
                htmlFor="threshold"
                hint="Products at or below this stock level are flagged."
                error={errors.lowStockThreshold}
              >
                <TextInput
                  id="threshold"
                  type="number"
                  min={0}
                  step={1}
                  value={String(form.lowStockThreshold)}
                  invalid={Boolean(errors.lowStockThreshold)}
                  onChange={(event) => patch({ lowStockThreshold: Number(event.target.value) })}
                />
              </Field>
              <Field label="Console theme" hint="Applies to this browser only; the server stores the default.">
                <Segmented
                  ariaLabel="Console theme"
                  value={form.theme}
                  onChange={(value) => patch({ theme: value as ThemePreference })}
                  items={[
                    { key: 'light', label: 'Light' },
                    { key: 'dark', label: 'Dark' },
                  ]}
                />
              </Field>
              <div className="field-full form-actions">
                <Button type="submit" variant="primary" icon="check" loading={saving}>
                  Save changes
                </Button>
              </div>
            </form>
          </CardBody>
        </Card>

        <div className="stack stack--gap">
          <NotificationCard form={form} onChange={patch} />

          <Card>
            <CardHeader title="Current server values" subtitle={`Theme in use: ${theme}`} />
            <CardBody>
              <KeyValue
                rows={[
                  { key: 'Store', value: settings?.storeName ?? '—' },
                  { key: 'Currency', value: <Badge tone="info">{settings?.currency ?? '—'}</Badge> },
                  { key: 'Timezone', value: settings?.timezone ?? '—' },
                  { key: 'Low-stock ≤', value: settings ? String(settings.lowStockThreshold) : '—' },
                  {
                    key: 'Notifications',
                    value: settings
                      ? [settings.notifyOrders && 'orders', settings.notifyStock && 'stock', settings.notifyWeekly && 'weekly']
                          .filter(Boolean)
                          .join(', ') || 'none'
                      : '—',
                  },
                ]}
              />
            </CardBody>
          </Card>

          <Alert tone="info" title="About these settings">
            Saving issues a real <span className="mono">PUT /api/settings</span> against the demo server,
            and reset posts to <span className="mono">POST /api/settings/reset</span>. Both are visible in the
            StackBridge network timeline.
          </Alert>
        </div>
      </div>
    </div>
  );
}

export default SettingsPage;
