import type { Order } from '@repo/contracts';
import { SAMPLE_ORDER } from '@repo/contracts';
// @repo/formatters has no root export, so this import stays external in the bundle and the
// package has to be installed at runtime.
import { formatCurrency } from '@repo/formatters/currency';

/** Marker string the verify script looks for inside the emitted bundle. */
export const RECEIPTS_MARKER = 'receipts: compiled into the bundle';

export function renderReceipt(order: Order = SAMPLE_ORDER): string {
  return `${order.id} — ${formatCurrency(order.totalInCents, order.currency)}`;
}
