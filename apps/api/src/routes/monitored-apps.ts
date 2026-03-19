import { z } from 'zod';
import type { FastifyInstance } from 'fastify';

import { monitoredAppCreateSchema, monitoredAppUpdateSchema } from '@playwatch/shared';

export function registerMonitoredAppRoutes(app: FastifyInstance) {
  app.get('/monitored-apps', async () => ({
    data: await app.services.monitoredApps.list()
  }));

  app.get('/monitored-apps/:id', async (request) => {
    const params = z.object({ id: z.string().uuid() }).parse(request.params);

    return {
      data: await app.services.monitoredApps.getById(params.id)
    };
  });

  app.post('/monitored-apps', async (request, reply) => {
    const body = monitoredAppCreateSchema.parse(request.body);
    const monitoredApp = await app.services.monitoredApps.create(body);

    return reply.code(201).send({
      data: monitoredApp
    });
  });

  app.patch('/monitored-apps/:id', async (request) => {
    const params = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = monitoredAppUpdateSchema.parse(request.body);

    return {
      data: await app.services.monitoredApps.update(params.id, body)
    };
  });

  app.delete('/monitored-apps/:id', async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).parse(request.params);
    await app.services.monitoredApps.delete(params.id);
    return reply.code(204).send();
  });
}
