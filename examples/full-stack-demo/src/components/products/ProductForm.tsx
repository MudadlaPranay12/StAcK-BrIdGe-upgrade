import { useState, type FormEvent } from 'react';
import type { Product, ProductStatus } from '../../data/types';
import type { CategoryWithCount } from '../../lib/dto';
import { Button } from '../ui/Button';
import { Field, SelectInput, TextareaInput, TextInput } from '../ui/Form';

export interface ProductInput {
  name: string;
  sku: string;
  categoryId: string;
  description: string;
  status: ProductStatus;
  price: number;
  cost: number;
  stock: number;
  reorderPoint: number;
}

interface FormState {
  name: string;
  sku: string;
  categoryId: string;
  description: string;
  status: ProductStatus;
  price: string;
  cost: string;
  stock: string;
  reorderPoint: string;
}

function toState(product: Product | null, categories: CategoryWithCount[]): FormState {
  if (product) {
    return {
      name: product.name,
      sku: product.sku,
      categoryId: product.categoryId,
      description: product.description,
      status: product.status,
      price: String(product.price),
      cost: String(product.cost),
      stock: String(product.stock),
      reorderPoint: String(product.reorderPoint),
    };
  }
  return {
    name: '',
    sku: '',
    categoryId: categories[0]?.id ?? '',
    description: '',
    status: 'active',
    price: '',
    cost: '',
    stock: '0',
    reorderPoint: '5',
  };
}

interface ProductFormProps {
  product: Product | null;
  categories: CategoryWithCount[];
  submitting?: boolean;
  issues?: Array<{ field: string; message: string }>;
  onSubmit: (input: ProductInput) => void;
  onCancel: () => void;
}

export function ProductForm({ product, categories, submitting, issues = [], onSubmit, onCancel }: ProductFormProps) {
  const [state, setState] = useState<FormState>(() => toState(product, categories));

  const issueFor = (field: string) => issues.find((issue) => issue.field === field)?.message;

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setState((current) => ({ ...current, [key]: value }));
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    onSubmit({
      name: state.name.trim(),
      sku: state.sku.trim().toUpperCase(),
      categoryId: state.categoryId,
      description: state.description.trim(),
      status: state.status,
      price: Number(state.price),
      cost: Number(state.cost),
      stock: Math.trunc(Number(state.stock)),
      reorderPoint: Math.trunc(Number(state.reorderPoint)),
    });
  }

  return (
    <form className="stack stack--gap" onSubmit={handleSubmit} id="product-form">
      <div className="form-grid">
        <Field label="Product name" required htmlFor="product-name" error={issueFor('name')} full>
          <TextInput id="product-name" value={state.name} onChange={(event) => update('name', event.target.value)} invalid={Boolean(issueFor('name'))} placeholder="e.g. Aurora Desk Lamp" />
        </Field>

        <Field label="SKU" required htmlFor="product-sku" error={issueFor('sku')} hint="3–24 characters of A–Z, 0–9 or hyphen.">
          <TextInput id="product-sku" value={state.sku} onChange={(event) => update('sku', event.target.value.toUpperCase())} invalid={Boolean(issueFor('sku'))} placeholder="AUR-LAMP-01" />
        </Field>

        <Field label="Category" required htmlFor="product-category" error={issueFor('categoryId')}>
          <SelectInput id="product-category" value={state.categoryId} onChange={(event) => update('categoryId', event.target.value)} invalid={Boolean(issueFor('categoryId'))}>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </SelectInput>
        </Field>

        <Field label="Price (USD)" required htmlFor="product-price" error={issueFor('price')}>
          <TextInput id="product-price" type="number" min="0" step="0.01" value={state.price} onChange={(event) => update('price', event.target.value)} invalid={Boolean(issueFor('price'))} placeholder="49.00" />
        </Field>

        <Field label="Unit cost (USD)" required htmlFor="product-cost" error={issueFor('cost')}>
          <TextInput id="product-cost" type="number" min="0" step="0.01" value={state.cost} onChange={(event) => update('cost', event.target.value)} invalid={Boolean(issueFor('cost'))} placeholder="21.50" />
        </Field>

        <Field label="Inventory" required htmlFor="product-stock" error={issueFor('stock')}>
          <TextInput id="product-stock" type="number" min="0" step="1" value={state.stock} onChange={(event) => update('stock', event.target.value)} invalid={Boolean(issueFor('stock'))} />
        </Field>

        <Field label="Reorder point" required htmlFor="product-reorder" error={issueFor('reorderPoint')}>
          <TextInput id="product-reorder" type="number" min="0" step="1" value={state.reorderPoint} onChange={(event) => update('reorderPoint', event.target.value)} invalid={Boolean(issueFor('reorderPoint'))} />
        </Field>

        <Field label="Status" required htmlFor="product-status" error={issueFor('status')}>
          <SelectInput id="product-status" value={state.status} onChange={(event) => update('status', event.target.value as ProductStatus)} invalid={Boolean(issueFor('status'))}>
            <option value="active">Active</option>
            <option value="draft">Draft</option>
            <option value="archived">Archived</option>
          </SelectInput>
        </Field>

        <Field label="Description" htmlFor="product-description" full hint="Shown on the storefront product card.">
          <TextareaInput id="product-description" value={state.description} onChange={(event) => update('description', event.target.value)} placeholder="A short merchandising description." />
        </Field>
      </div>

      <div className="form-actions">
        <Button variant="ghost" onClick={onCancel} disabled={submitting}>
          Cancel
        </Button>
        <Button variant="primary" type="submit" loading={submitting} icon={product ? 'check' : 'plus'}>
          {product ? 'Save changes' : 'Create product'}
        </Button>
      </div>
    </form>
  );
}
