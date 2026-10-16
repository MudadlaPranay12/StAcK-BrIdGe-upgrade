import { useEffect, useState } from 'react';
import type { Product } from '../../data/types';
import { ApiError, apiRequest } from '../../lib/api';
import { describeError, useToast } from '../../app/AppContext';
import { formatNumber } from '../../lib/utils';
import { Modal } from '../ui/Overlay';
import { Button } from '../ui/Button';
import { Field, TextInput } from '../ui/Form';
import { Alert } from '../ui/Display';

interface StockAdjustDialogProps {
  open: boolean;
  product: Product | null;
  onClose: () => void;
  onAdjusted: (product: Product) => void;
}

/** Adjust inventory by a signed delta through POST /api/products/:id/stock. */
export function StockAdjustDialog({ open, product, onClose, onAdjusted }: StockAdjustDialogProps) {
  const toast = useToast();
  const [delta, setDelta] = useState('0');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setDelta('0');
      setError(null);
    }
  }, [open, product]);

  const parsed = Math.trunc(Number(delta));
  const next = product ? product.stock + (Number.isFinite(parsed) ? parsed : 0) : 0;

  async function submit() {
    if (!product) return;
    if (!Number.isInteger(parsed) || parsed === 0) {
      setError('Enter a non-zero whole number, for example 5 or -3.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await apiRequest<{ item: Product }>(`/api/products/${product.id}/stock`, { method: 'POST', body: { delta: parsed } });
      toast({ tone: 'success', title: 'Stock adjusted', text: `${product.name} → ${formatNumber(result.item.stock)} units` });
      onAdjusted(result.item);
      onClose();
    } catch (err) {
      const message = err instanceof ApiError && err.fieldIssues.length > 0 ? err.fieldIssues[0]!.message : describeError(err);
      setError(message);
      toast({ tone: 'error', title: 'Stock not adjusted', text: message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Adjust inventory"
      subtitle={product?.name}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} loading={busy} icon="check">
            Apply adjustment
          </Button>
        </>
      }
    >
      <div className="stack stack--gap">
        <Alert tone="info" title="Current stock">
          {product ? `${formatNumber(product.stock)} units on hand · reorder at ${formatNumber(product.reorderPoint)}.` : 'No product selected.'}
        </Alert>

        <Field label="Adjustment" hint="Positive adds stock, negative removes it." error={error} htmlFor="stock-delta">
          <TextInput id="stock-delta" type="number" step="1" value={delta} onChange={(event) => setDelta(event.target.value)} invalid={Boolean(error)} />
        </Field>

        <div className="row row--gap row--wrap">
          {[-5, -1, 1, 5, 10].map((value) => (
            <Button key={value} size="sm" variant="secondary" onClick={() => setDelta(String(value))}>
              {value > 0 ? `+${value}` : value}
            </Button>
          ))}
        </div>

        <div className="row row--between">
          <span className="muted">Resulting stock</span>
          <span className="strong">{formatNumber(Math.max(0, next))} units</span>
        </div>
      </div>
    </Modal>
  );
}
