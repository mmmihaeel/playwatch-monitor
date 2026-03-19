import type { AppConfig } from '@playwatch/config';
import {
  createMonitoredAppsRepository,
  createSnapshotsRepository,
  type DatabaseHandle
} from '@playwatch/db';
import type { StorageAdapter } from '@playwatch/storage';

import { createMonitoredAppsService, createSnapshotsService } from './services/index.js';
import type { ApiServices } from './services/index.js';

export function buildApiServices(database: DatabaseHandle, config: AppConfig, storage: StorageAdapter): ApiServices {
  const monitoredAppsRepository = createMonitoredAppsRepository(database);
  const snapshotsRepository = createSnapshotsRepository(database);

  return {
    monitoredApps: createMonitoredAppsService(
      monitoredAppsRepository,
      snapshotsRepository,
      storage,
      config.PG_BOSS_SCHEMA
    ),
    snapshots: createSnapshotsService(monitoredAppsRepository, snapshotsRepository, config)
  };
}
