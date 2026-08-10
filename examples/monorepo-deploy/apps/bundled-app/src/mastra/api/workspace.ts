import { registerApiRoute } from '@mastra/core/server';
import { CONTRACTS_MARKER, SAMPLE_ORDER } from '@repo/contracts';
import { LOGGING_MARKER, label } from '@repo/logging';
import { ORDERS_MARKER, listOrders } from '@repo/orders';

// Every workspace package this app imports has a root export, so the bundler compiles all of them
// into the output. None of them should end up in the artifact's package.json.
export const workspaceRoute = registerApiRoute('/workspace', {
  method: 'GET',
  handler: async c =>
    c.json({
      scope: label('bundled-app'),
      markers: [CONTRACTS_MARKER, ORDERS_MARKER, LOGGING_MARKER],
      sample: SAMPLE_ORDER,
      orders: listOrders(),
    }),
});
