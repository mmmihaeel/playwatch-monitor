import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { migrate } from 'drizzle-orm/node-postgres/migrator';

import { readConfig } from '@playwatch/config';

import { closeDatabase, initDatabase } from '../src/client.js';

const config = readConfig();
const database = initDatabase(config.DATABASE_URL);
const currentDir = dirname(fileURLToPath(import.meta.url));

async function run() {
  await migrate(database.db, {
    migrationsFolder: resolve(currentDir, '../migrations')
  });
}

run()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDatabase();
  });
