import { registerApiRoute } from '@mastra/core/server';
// Imported straight from the entry: the bundler compiles this subpath in, but the rest of
// @repo/formatters stays external, so the package still has to be installed.
import { formatDate } from '@repo/formatters/date';
// Compiled into the bundle, and it reaches @repo/formatters/currency at runtime.
import { RECEIPTS_MARKER, renderReceipt } from '@repo/receipts';

export const workspaceRoute = registerApiRoute('/workspace', {
  method: 'GET',
  handler: async c => {
    // Resolved at runtime out of the artifact's node_modules, which is where the packed tarball
    // was installed. A missing tarball fails here rather than at build time.
    const { FORMATTERS_MARKER } = await import('@repo/formatters/currency');

    return c.json({
      markers: [RECEIPTS_MARKER, FORMATTERS_MARKER],
      receipt: renderReceipt(),
      date: formatDate('2026-08-10T00:00:00.000Z'),
    });
  },
});
