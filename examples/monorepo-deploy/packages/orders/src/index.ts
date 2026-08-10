import type { Order } from '@repo/contracts';
import { SAMPLE_ORDER } from '@repo/contracts';

/** Marker string the verify script looks for inside the emitted bundle. */
export const ORDERS_MARKER = 'orders: compiled into the bundle';

export function listOrders(): Order[] {
  return [SAMPLE_ORDER, { id: 'ord_1002', totalInCents: 990, currency: 'USD' }];
}
