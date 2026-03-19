// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';

import type { AppConfig } from '@playwatch/config';
import type { MonitoredAppListItem, SnapshotRecord } from '@playwatch/db';

import { NotFoundError } from '../errors.js';
import { createSnapshotsService } from './snapshots-service.js';

function createConfigFixture(): AppConfig {
  return {
    NODE_ENV: 'test',
    DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/playwatch',
    API_HOST: '127.0.0.1',
    API_PORT: 4000,
    API_TRUST_PROXY: false,
    WEB_PORT: 3000,
    WEB_ORIGIN: 'http://localhost:3000',
    CORS_ORIGINS: ['http://localhost:3000'],
    WORKER_CONCURRENCY: 2,
    CAPTURE_SCHEDULER_INTERVAL_MS: 10_000,
    SCREENSHOT_STORAGE_DRIVER: 'local',
    SCREENSHOT_STORAGE_DIR: './data/screenshots',
    STORAGE_PUBLIC_PATH: '/assets/screenshots',
    GCS_BUCKET_NAME: undefined,
    GOOGLE_PLAY_DEFAULT_REGION: 'US',
    GOOGLE_PLAY_DEFAULT_LOCALE: 'en-US',
    PG_BOSS_SCHEMA: 'pgboss',
    PLAYWRIGHT_HEADLESS: true,
    PLAYWRIGHT_TIMEOUT_MS: 60_000
  };
}

function createMonitoredApp(overrides: Partial<MonitoredAppListItem> = {}): MonitoredAppListItem {
  return {
    id: '550e8400-e29b-41d4-a716-446655440000',
    packageId: 'com.spotify.music',
    title: 'Spotify',
    sourceUrl: 'https://play.google.com/store/apps/details?id=com.spotify.music',
    region: 'US',
    locale: 'en-US',
    captureFrequencyMinutes: 60,
    nextCaptureAt: new Date('2026-03-19T08:00:00.000Z'),
    lastAttemptAt: new Date('2026-03-19T07:00:00.000Z'),
    lastSuccessAt: new Date('2026-03-19T07:00:00.000Z'),
    isActive: true,
    snapshotCount: 1,
    createdAt: new Date('2026-03-19T06:00:00.000Z'),
    updatedAt: new Date('2026-03-19T07:00:00.000Z'),
    ...overrides
  };
}

function createSnapshot(overrides: Partial<SnapshotRecord> = {}): SnapshotRecord {
  return {
    id: '660e8400-e29b-41d4-a716-446655440000',
    monitoredAppId: '550e8400-e29b-41d4-a716-446655440000',
    objectKey: 'com.spotify.music/2026-03-19T07-00-00-000Z.png',
    capturedAt: new Date('2026-03-19T07:00:00.000Z'),
    status: 'success',
    contentHash: 'abc123',
    changedFromPrevious: true,
    previousSnapshotId: null,
    failureReason: null,
    createdAt: new Date('2026-03-19T07:00:00.000Z'),
    ...overrides
  };
}

describe('createSnapshotsService', () => {
  it('returns snapshots with asset URLs', async () => {
    const monitoredAppsRepository = {
      getById: vi.fn().mockResolvedValue(createMonitoredApp())
    };
    const snapshotsRepository = {
      listByMonitoredAppId: vi.fn().mockResolvedValue([createSnapshot()])
    };

    const service = createSnapshotsService(
      monitoredAppsRepository as never,
      snapshotsRepository as never,
      createConfigFixture()
    );

    const result = await service.listByMonitoredAppId('550e8400-e29b-41d4-a716-446655440000', {
      limit: 30
    });

    expect(result).toHaveLength(1);
    expect(result[0]?.imageUrl).toBe('/assets/screenshots/com.spotify.music/2026-03-19T07-00-00-000Z.png');
  });

  it('throws when the monitored app does not exist', async () => {
    const monitoredAppsRepository = {
      getById: vi.fn().mockResolvedValue(null)
    };
    const snapshotsRepository = {
      listByMonitoredAppId: vi.fn()
    };

    const service = createSnapshotsService(
      monitoredAppsRepository as never,
      snapshotsRepository as never,
      createConfigFixture()
    );

    await expect(() =>
      service.listByMonitoredAppId('550e8400-e29b-41d4-a716-446655440000', { limit: 30 })
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
