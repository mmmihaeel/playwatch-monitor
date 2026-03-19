import { PgBoss } from 'pg-boss';

import {
  closeDatabase,
  createMonitoredAppsRepository,
  createSnapshotsRepository,
  initDatabase
} from '@playwatch/db';
import { createStorageAdapter } from '@playwatch/storage';

import { config } from './config.js';
import { captureListingJob } from './jobs/capture-listing.js';
import { scheduleDueCaptures } from './jobs/schedule-captures.js';
import { closeCaptureBrowser } from './lib/capture-play-store.js';

async function start() {
  const database = initDatabase(config.DATABASE_URL);
  const monitoredAppsRepository = createMonitoredAppsRepository(database);
  const snapshotsRepository = createSnapshotsRepository(database);
  const storage = createStorageAdapter(config);

  const boss = new PgBoss({
    connectionString: config.DATABASE_URL,
    schema: config.PG_BOSS_SCHEMA
  });

  await boss.start();
  await boss.createQueue('capture-listing');
  boss.on('error', (error) => {
    console.error(error);
  });

  await boss.work<{ monitoredAppId: string }>('capture-listing', {
    localConcurrency: config.WORKER_CONCURRENCY
  }, async (jobs) => {
    for (const job of jobs) {
      const monitoredAppId = job.data?.monitoredAppId;

      if (!monitoredAppId) {
        continue;
      }

      await captureListingJob({
        config,
        monitoredAppsRepository,
        snapshotsRepository,
        storage,
        monitoredAppId
      });
    }
  });

  let isScheduling = false;
  const runSchedulerTick = async () => {
    if (isScheduling) {
      return;
    }

    isScheduling = true;

    try {
      await scheduleDueCaptures({
        boss,
        monitoredAppsRepository
      });
    } finally {
      isScheduling = false;
    }
  };

  await runSchedulerTick();
  const interval = setInterval(() => {
    void runSchedulerTick();
  }, config.CAPTURE_SCHEDULER_INTERVAL_MS);
  interval.unref();

  const shutdown = async () => {
    clearInterval(interval);
    await boss.stop();
    await closeCaptureBrowser();
    await closeDatabase();
  };

  process.on('SIGINT', () => {
    void shutdown().finally(() => process.exit(0));
  });

  process.on('SIGTERM', () => {
    void shutdown().finally(() => process.exit(0));
  });
}

start().catch((error) => {
  console.error(error);
  process.exit(1);
});
