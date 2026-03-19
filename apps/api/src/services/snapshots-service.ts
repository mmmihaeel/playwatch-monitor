import type { AppConfig } from '@playwatch/config';
import type { MonitoredAppsRepository, SnapshotsRepository } from '@playwatch/db';
import type { SnapshotQuery } from '@playwatch/shared';

import { NotFoundError } from '../errors.js';
import { toSnapshotDto } from '../mappers.js';

export function createSnapshotsService(
  monitoredAppsRepository: MonitoredAppsRepository,
  snapshotsRepository: SnapshotsRepository,
  config: AppConfig
) {
  return {
    async listByMonitoredAppId(monitoredAppId: string, query: SnapshotQuery) {
      const monitoredApp = await monitoredAppsRepository.getById(monitoredAppId);

      if (!monitoredApp) {
        throw new NotFoundError('Monitored app not found.');
      }

      const snapshots = await snapshotsRepository.listByMonitoredAppId(monitoredAppId, query);
      return snapshots.map((snapshot) => toSnapshotDto(snapshot, config));
    }
  };
}
