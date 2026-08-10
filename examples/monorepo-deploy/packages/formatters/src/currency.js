// Plain JavaScript on purpose. This package has no root export, so the bundler cannot compile it
// into the output — it ships as a tarball and is installed into the artifact's node_modules, where
// Node refuses to load TypeScript source.

/** Marker string the verify script looks for in the running server's response. */
export const FORMATTERS_MARKER = 'formatters: installed from workspace-module/';

export function formatCurrency(amountInCents, currency) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amountInCents / 100);
}
