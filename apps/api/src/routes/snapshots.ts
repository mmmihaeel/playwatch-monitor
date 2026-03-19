import { z } from 'zod';
import type { FastifyInstance } from 'fastify';

import { snapshotQuerySchema } from '@playwatch/shared';

export function registerSnapshotRoutes(app: FastifyInstance) {
  app.get('/monitored-apps/:id/snapshots', async (request) => {
    const params = z.object({ id: z.string().uuid() }).parse(request.params);
    const query = snapshotQuerySchema.parse(request.query);

    return {
      data: await app.services.snapshots.listByMonitoredAppId(params.id, query)
    };
  });
}
