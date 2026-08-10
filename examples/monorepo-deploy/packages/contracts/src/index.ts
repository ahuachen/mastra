/** Marker string the verify script looks for inside the emitted bundle. */
export const CONTRACTS_MARKER = 'contracts: compiled into the bundle';

export type Order = {
  id: string;
  totalInCents: number;
  currency: string;
};

export const SAMPLE_ORDER: Order = {
  id: 'ord_1001',
  totalInCents: 4250,
  currency: 'USD',
};
