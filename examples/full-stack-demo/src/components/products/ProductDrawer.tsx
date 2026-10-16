import { useEffect, useState } from 'react';
import type { Product } from '../../data/types';
import type { CategoryWithCount } from '../../lib/dto';
import { ApiError, apiRequest } from '../../lib/api';
import { useToast, describeError } from '../../app/AppContext';
import { Drawer } from '../ui/Overlay';
import { ProductForm, type ProductInput } from './ProductForm';

interface ProductDrawerProps {
  open: boolean;
  product: Product | null;
  categories: CategoryWithCount[];
  onClose: () => void;
  onSaved: (product: Product) => void;
}

/** Create/edit drawer. Owns the submit request, field errors and toasts. */
export function ProductDrawer({ open, product, categories, onClose, onSaved }: ProductDrawerProps) {
  const toast = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [issues, setIssues] = useState<Array<{ field: string; message: string }>>([]);

  useEffect(() => {
    if (open) setIssues([]);
  }, [open, product]);

  async function handleSubmit(input: ProductInput) {
    setSubmitting(true);
    setIssues([]);
    try {
      const result = product
        ? await apiRequest<{ item: Product }>(`/api/products/${product.id}`, { method: 'PUT', body: input })
        : await apiRequest<{ item: Product }>('/api/products', { method: 'POST', body: input });
      toast({ tone: 'success', title: product ? 'Product updated' : 'Product created', text: result.item.name });
      onSaved(result.item);
      onClose();
    } catch (error) {
      if (error instanceof ApiError && error.fieldIssues.length > 0) {
        setIssues(error.fieldIssues);
        toast({ tone: 'error', title: 'Please fix the highlighted fields', text: error.message });
      } else {
        toast({ tone: 'error', title: 'Could not save product', text: describeError(error) });
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={product ? 'Edit product' : 'New product'}
      subtitle={product ? product.name : 'Add an item to the catalogue'}
      size="wide"
    >
      <ProductForm product={product} categories={categories} submitting={submitting} issues={issues} onSubmit={handleSubmit} onCancel={onClose} />
    </Drawer>
  );
}
