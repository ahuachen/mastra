import { ConsoleLogger } from '@mastra/core/logger';
import { Mastra } from '@mastra/core/mastra';
import { workspaceRoute } from './api/workspace';

export const mastra = new Mastra({
  server: {
    port: process.env.MASTRA_PORT ? Number(process.env.MASTRA_PORT) : 4111,
    apiRoutes: [workspaceRoute],
  },
  logger: new ConsoleLogger({ level: 'info' }),
});
