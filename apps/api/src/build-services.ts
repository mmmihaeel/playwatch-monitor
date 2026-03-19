import type { AppConfig } from '@playwatch/config';
import {
  createMonitoredAppsRepository,
  createSnapshotsRepository,
  type DatabaseHandle
} from '@playwatch/db';

import { createMonitoredAppsService, createSnapshotsService } from './services/index.js';

export function buildApiServices(database: DatabaseHandle, config: AppConfig) {
  const monitoredAppsRepository = createMonitoredAppsRepository(database);
  const snapshotsRepository = createSnapshotsRepository(database);

  return {
    monitoredApps: createMonitoredAppsService(monitoredAppsRepository),
    snapshots: createSnapshotsService(monitoredAppsRepository, snapshotsRepository, config)
  };
}
