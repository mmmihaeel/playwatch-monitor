import type { AppConfig } from '@playwatch/config';
import type { MonitoredAppListItem, SnapshotRecord } from '@playwatch/db';
import type { MonitoredAppDto, SnapshotDto } from '@playwatch/shared';

function encodeObjectKey(objectKey: string) {
  return objectKey
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

export function toMonitoredAppDto(record: MonitoredAppListItem): MonitoredAppDto {
  return {
    id: record.id,
    packageId: record.packageId,
    title: record.title ?? null,
    sourceUrl: record.sourceUrl,
    region: record.region,
    locale: record.locale,
    captureFrequencyMinutes: record.captureFrequencyMinutes,
    nextCaptureAt: record.nextCaptureAt.toISOString(),
    lastAttemptAt: record.lastAttemptAt?.toISOString() ?? null,
    lastSuccessAt: record.lastSuccessAt?.toISOString() ?? null,
    isActive: record.isActive,
    snapshotCount: Number(record.snapshotCount),
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString()
  };
}

export function toSnapshotDto(record: SnapshotRecord, config: AppConfig): SnapshotDto {
  return {
    id: record.id,
    monitoredAppId: record.monitoredAppId,
    objectKey: record.objectKey ?? null,
    imageUrl: record.objectKey
      ? `${config.STORAGE_PUBLIC_PATH}/${encodeObjectKey(record.objectKey)}`
      : null,
    capturedAt: record.capturedAt.toISOString(),
    status: record.status,
    contentHash: record.contentHash ?? null,
    changedFromPrevious: record.changedFromPrevious ?? null,
    previousSnapshotId: record.previousSnapshotId ?? null,
    failureReason: record.failureReason ?? null
  };
}
