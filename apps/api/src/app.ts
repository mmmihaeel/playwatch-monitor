import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import Fastify from 'fastify';
import { ZodError } from 'zod';

import type { AppConfig } from '@playwatch/config';
import type { StorageAdapter } from '@playwatch/storage';

import { ApplicationError } from './errors.js';
import { registerHealthRoutes } from './routes/health.js';
import { registerMonitoredAppRoutes } from './routes/monitored-apps.js';
import { registerSnapshotRoutes } from './routes/snapshots.js';
import { registerStorageAssetRoutes } from './routes/storage-assets.js';
import type { ApiServices } from './services/index.js';

declare module 'fastify' {
  interface FastifyInstance {
    services: ApiServices;
  }
}

export async function buildApp(options: {
  config: AppConfig;
  services: ApiServices;
  storage: StorageAdapter;
}) {
  const app = Fastify({
    trustProxy: Boolean(options.config.API_TRUST_PROXY),
    logger: {
      level: options.config.NODE_ENV === 'production' ? 'info' : 'debug'
    },
    bodyLimit: 1_048_576
  });

  await app.register(helmet, {
    global: true,
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: {
      policy: 'cross-origin'
    },
    strictTransportSecurity: options.config.NODE_ENV === 'production' ? undefined : false
  });

  await app.register(cors, {
    methods: ['GET', 'HEAD', 'POST', 'PATCH', 'OPTIONS'],
    origin: (origin, callback) => {
      if (!origin || options.config.CORS_ORIGINS.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(null, false);
    }
  });

  await app.register(rateLimit, {
    max: 300,
    timeWindow: '1 minute'
  });

  app.decorate('services', options.services);
  registerStorageAssetRoutes(app, options.config, options.storage);

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError) {
      reply.status(400).send({
        error: 'VALIDATION_ERROR',
        message: error.issues.map((issue) => issue.message).join('; ')
      });
      return;
    }

    if (error instanceof ApplicationError) {
      reply.status(error.statusCode).send({
        error: error.code,
        message: error.message
      });
      return;
    }

    request.log.error({ err: error }, 'Unhandled API error');
    reply.status(500).send({
      error: 'INTERNAL_SERVER_ERROR',
      message: 'Unexpected server error.'
    });
  });

  app.setNotFoundHandler((request, reply) => {
    reply.status(404).send({
      error: 'NOT_FOUND',
      message: `Route ${request.method}:${request.url} not found.`
    });
  });

  await app.register((api) => {
    registerHealthRoutes(api);
    registerMonitoredAppRoutes(api);
    registerSnapshotRoutes(api);
  }, { prefix: '/api' });

  return app;
}
