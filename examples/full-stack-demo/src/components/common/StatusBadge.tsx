// Reusable status/segment badges shared by tables, drawers and the dashboard.

import type { OrderStatus, ProductStatus } from '../../data/types';
import { productStatusTone, segmentTone, statusTone, titleCase } from '../../lib/utils';
import { Badge } from '../ui/Display';

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return (
    <Badge tone={statusTone(status)} dot>
      {titleCase(status)}
    </Badge>
  );
}

export function ProductStatusBadge({ status }: { status: ProductStatus }) {
  return <Badge tone={productStatusTone(status)}>{titleCase(status)}</Badge>;
}

export function SegmentBadge({ segment }: { segment: string }) {
  return <Badge tone={segmentTone(segment as never)}>{titleCase(segment)}</Badge>;
}

export function ChannelLabel({ channel }: { channel: string }) {
  return <span>{titleCase(channel)}</span>;
}
