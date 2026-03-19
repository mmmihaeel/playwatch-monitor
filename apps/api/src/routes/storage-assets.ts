import type { FastifyInstance } from 'fastify';

import type { AppConfig } from '@playwatch/config';
import type { StorageAdapter } from '@playwatch/storage';

function decodeObjectKey(pathValue: string) {
  return pathValue
    .split('/')
    .map((segment) => decodeURIComponent(segment))
    .join('/');
}

export function registerStorageAssetRoutes(
  app: FastifyInstance,
  config: AppConfig,
  storage: StorageAdapter
) {
  app.get<{ Params: { '*': string } }>(`${config.STORAGE_PUBLIC_PATH}/*`, async (request, reply) => {
    try {
      const objectKey = decodeObjectKey(request.params['*']);
      const asset = await storage.read(objectKey);

      if (!asset) {
        reply.status(404).send({
          error: 'NOT_FOUND',
          message: 'Screenshot asset not found.'
        });
        return;
      }

      reply.header('Cache-Control', 'public, max-age=31536000, immutable');
      reply.type(asset.contentType);
      reply.send(asset.body);
    } catch {
      reply.status(404).send({
        error: 'NOT_FOUND',
        message: 'Screenshot asset not found.'
      });
    }
  });
}
