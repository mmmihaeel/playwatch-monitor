import type { MonitoredAppsRepository, SnapshotsRepository } from '@playwatch/db';
import { normalizeGooglePlayUrl } from '@playwatch/shared';
import type { MonitoredAppCreateInput, MonitoredAppUpdateInput } from '@playwatch/shared';
import type { StorageAdapter } from '@playwatch/storage';

import { ConflictError, NotFoundError } from '../errors.js';
import { toMonitoredAppDto } from '../mappers.js';
import type { MonitoredAppsService } from './types.js';

export function createMonitoredAppsService(
  monitoredAppsRepository: MonitoredAppsRepository,
  snapshotsRepository: SnapshotsRepository,
  storage: StorageAdapter,
  pgBossSchema: string
): MonitoredAppsService {
  return {
    async list() {
      const monitoredApps = await monitoredAppsRepository.list();
      return monitoredApps.map(toMonitoredAppDto);
    },
    async getById(id: string) {
      const monitoredApp = await monitoredAppsRepository.getById(id);

      if (!monitoredApp) {
        throw new NotFoundError('Monitored app not found.');
      }

      return toMonitoredAppDto(monitoredApp);
    },
    async create(input: MonitoredAppCreateInput) {
      const normalized = normalizeGooglePlayUrl(input.sourceUrl);
      const existing = await monitoredAppsRepository.getByPackageId(normalized.packageId);

      if (existing) {
        throw new ConflictError('App is already being monitored.');
      }

      const created = await monitoredAppsRepository.create({
        packageId: normalized.packageId,
        sourceUrl: normalized.normalizedUrl,
        region: input.region,
        locale: input.locale,
        captureFrequencyMinutes: input.captureFrequencyMinutes,
        captureImmediately: true
      });

      if (!created) {
        throw new ConflictError('App is already being monitored.');
      }

      const monitoredApp = await monitoredAppsRepository.getById(created.id);

      if (!monitoredApp) {
        throw new NotFoundError('Monitored app not found after creation.');
      }

      return toMonitoredAppDto(monitoredApp);
    },
    async update(id: string, input: MonitoredAppUpdateInput) {
      const existing = await monitoredAppsRepository.getById(id);

      if (!existing) {
        throw new NotFoundError('Monitored app not found.');
      }

      let packageId: string | undefined;
      let sourceUrl: string | undefined;
      const trackingContextChanged =
        input.sourceUrl !== undefined ||
        input.region !== undefined ||
        input.locale !== undefined ||
        input.captureFrequencyMinutes !== undefined;

      if (input.sourceUrl) {
        const normalized = normalizeGooglePlayUrl(input.sourceUrl);
        const duplicate = await monitoredAppsRepository.getByPackageId(normalized.packageId);

        if (duplicate && duplicate.id !== id) {
          throw new ConflictError('Another monitored app already uses this Google Play package.');
        }

        packageId = normalized.packageId;
        sourceUrl = normalized.normalizedUrl;
      }

      const willBeActive = input.isActive ?? existing.isActive;
      const shouldCaptureImmediately =
        (input.isActive === true && !existing.isActive) ||
        (trackingContextChanged && willBeActive);

      const monitoredApp = await monitoredAppsRepository.update(id, {
        ...input,
        packageId,
        sourceUrl,
        nextCaptureAt: shouldCaptureImmediately ? new Date() : undefined
      });

      if (!monitoredApp) {
        throw new NotFoundError('Monitored app not found.');
      }

      const refreshed = await monitoredAppsRepository.getById(monitoredApp.id);

      if (!refreshed) {
        throw new NotFoundError('Monitored app not found after update.');
      }

      return toMonitoredAppDto(refreshed);
    },
    async delete(id: string) {
      const existing = await monitoredAppsRepository.getById(id);

      if (!existing) {
        throw new NotFoundError('Monitored app not found.');
      }

      await monitoredAppsRepository.update(id, {
        isActive: false
      });
      await monitoredAppsRepository.deleteQueuedCaptureJobs(id, pgBossSchema);

      const objectKeys = Array.from(
        new Set(
          (await snapshotsRepository.listObjectKeysByMonitoredAppId(id)).filter(
            (objectKey): objectKey is string => Boolean(objectKey)
          )
        )
      );

      const deleted = await monitoredAppsRepository.delete(id);

      if (!deleted) {
        throw new NotFoundError('Monitored app not found.');
      }

      const cleanupResults = await Promise.allSettled(
        objectKeys.map(async (objectKey) => {
          await storage.remove(objectKey);
        })
      );

      cleanupResults.forEach((result, index) => {
        if (result.status === 'rejected') {
          const cleanupError =
            result.reason instanceof Error
              ? { message: result.reason.message }
              : { message: String(result.reason) };

          console.error('Failed to remove screenshot during monitored app deletion.', {
            monitoredAppId: id,
            objectKey: objectKeys[index],
            error: cleanupError
          });
        }
      });
    }
  };
}
