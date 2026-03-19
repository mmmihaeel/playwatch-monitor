import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';

import * as schema from './schema.js';

export function createDatabase(databaseUrl: string) {
  const pool = new Pool({
    connectionString: databaseUrl,
    max: 10
  });

  const db = drizzle(pool, { schema });

  return {
    pool,
    db
  };
}

export type DatabaseHandle = ReturnType<typeof createDatabase>;
export type Database = DatabaseHandle['db'];

let database: DatabaseHandle | null = null;

export function initDatabase(databaseUrl: string) {
  if (!database) {
    database = createDatabase(databaseUrl);
  }

  return database;
}

export function getDatabase() {
  if (!database) {
    throw new Error('Database has not been initialized.');
  }

  return database;
}

export async function closeDatabase() {
  if (!database) {
    return;
  }

  await database.pool.end();
  database = null;
}
