import type { Product } from '../../data/types';
import { Link } from '../../lib/router';
import { formatCurrency, formatNumber } from '../../lib/utils';
import { Button } from '../ui/Button';
import { Icon } from '../ui/Icon';
import { Thumb } from '../ui/Display';

interface StoreProductCardProps {
  product: Product;
  currency: string;
  onAdd: (product: Product) => void;
}

/** Catalogue tile used on the storefront grid. */
export function StoreProductCard({ product, currency, onAdd }: StoreProductCardProps) {
  const soldOut = product.stock <= 0;
  return (
    <article className="store-card">
      <Link to={`/storefront/${product.id}`} aria-label={`View ${product.name}`}>
        <div className="store-card__media">
          <Thumb label={product.name} accent={product.accent} size="xl" />
        </div>
      </Link>
      <div className="store-card__body">
        <div className="row row--between">
          <Link className="store-card__name" to={`/storefront/${product.id}`}>
            {product.name}
          </Link>
          <span className="rating">
            <Icon name="star" size={13} />
            {product.rating.toFixed(1)}
          </span>
        </div>
        <p className="store-card__desc">{product.description}</p>
        <div className="row row--between">
          <span className="price">{formatCurrency(product.price, currency)}</span>
          <span className="dim" style={{ fontSize: 11.5 }}>
            {soldOut ? 'Out of stock' : `${formatNumber(product.stock)} in stock`}
          </span>
        </div>
        <Button variant="primary" block icon="cart" disabled={soldOut} onClick={() => onAdd(product)}>
          {soldOut ? 'Sold out' : 'Add to cart'}
        </Button>
      </div>
    </article>
  );
}
