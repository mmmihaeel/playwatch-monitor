import { closeDatabase, initDatabase } from '@playwatch/db';
import { createStorageAdapter } from '@playwatch/storage';

import { buildApp } from './app.js';
import { buildApiServices } from './build-services.js';
import { config } from './config.js';

async function start() {
  const database = initDatabase(config.DATABASE_URL);
  const storage = createStorageAdapter(config);
  const app = await buildApp({
    config,
    services: buildApiServices(database, config, storage),
    storage
  });

  const shutdown = async () => {
    await app.close();
    await closeDatabase();
  };

  process.on('SIGINT', () => {
    void shutdown().finally(() => process.exit(0));
  });

  process.on('SIGTERM', () => {
    void shutdown().finally(() => process.exit(0));
  });

  await app.listen({
    port: config.API_PORT,
    host: config.API_HOST
  });
}

start().catch((error) => {
  console.error(error);
  process.exit(1);
});
