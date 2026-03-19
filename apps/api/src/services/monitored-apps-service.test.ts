// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';

import type { MonitoredAppListItem, MonitoredAppRecord } from '@playwatch/db';

import { ConflictError, NotFoundError } from '../errors.js';
import { createMonitoredAppsService } from './monitored-apps-service.js';

function createMonitoredAppRecord(overrides: Partial<MonitoredAppRecord> = {}): MonitoredAppRecord {
  return {
    id: '550e8400-e29b-41d4-a716-446655440000',
    packageId: 'com.spotify.music',
    title: null,
    sourceUrl: 'https://play.google.com/store/apps/details?id=com.spotify.music',
    region: 'US',
    locale: 'en-US',
    captureFrequencyMinutes: 60,
    nextCaptureAt: new Date('2026-03-19T08:00:00.000Z'),
    lastAttemptAt: null,
    lastSuccessAt: null,
    isActive: true,
    createdAt: new Date('2026-03-19T07:00:00.000Z'),
    updatedAt: new Date('2026-03-19T07:00:00.000Z'),
    ...overrides
  };
}

function createMonitoredAppListItem(overrides: Partial<MonitoredAppListItem> = {}): MonitoredAppListItem {
  return {
    ...createMonitoredAppRecord(overrides),
    snapshotCount: 0,
    ...overrides
  };
}

function createRepositoryFixture() {
  return {
    list: vi.fn(),
    getById: vi.fn(),
    getByPackageId: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    deleteQueuedCaptureJobs: vi.fn(),
    claimDue: vi.fn()
  };
}

function createSnapshotsRepositoryFixture() {
  return {
    listByMonitoredAppId: vi.fn(),
    getLatestByMonitoredAppId: vi.fn(),
    listObjectKeysByMonitoredAppId: vi.fn(),
    recordSuccess: vi.fn(),
    recordFailure: vi.fn(),
    countForMonitoredApp: vi.fn()
  };
}

describe('createMonitoredAppsService', () => {
  it('creates a monitored app with a normalized Google Play URL', async () => {
    const repository = createRepositoryFixture();
    const snapshotsRepository = createSnapshotsRepositoryFixture();
    const storage = { remove: vi.fn() };
    const createdRecord = createMonitoredAppRecord();
    const refreshedRecord = createMonitoredAppListItem({
      title: 'Spotify: Music and Podcasts',
      snapshotCount: 1
    });

    repository.getByPackageId.mockResolvedValue(null);
    repository.create.mockResolvedValue(createdRecord);
    repository.getById.mockResolvedValue(refreshedRecord);

    const service = createMonitoredAppsService(repository as never, snapshotsRepository as never, storage as never, 'pgboss');
    const result = await service.create({
      sourceUrl: 'https://play.google.com/store/apps/details?id=com.spotify.music&hl=en_US',
      region: 'US',
      locale: 'en-US',
      captureFrequencyMinutes: 60
    });

    expect(repository.create).toHaveBeenCalledWith({
      packageId: 'com.spotify.music',
      sourceUrl: 'https://play.google.com/store/apps/details?id=com.spotify.music',
      region: 'US',
      locale: 'en-US',
      captureFrequencyMinutes: 60,
      captureImmediately: true
    });
    expect(result.title).toBe('Spotify: Music and Podcasts');
    expect(result.snapshotCount).toBe(1);
  });

  it('rejects duplicate package registrations', async () => {
    const repository = createRepositoryFixture();
    const snapshotsRepository = createSnapshotsRepositoryFixture();
    const storage = { remove: vi.fn() };
    repository.getByPackageId.mockResolvedValue(createMonitoredAppRecord());

    const service = createMonitoredAppsService(repository as never, snapshotsRepository as never, storage as never, 'pgboss');

    await expect(() =>
      service.create({
        sourceUrl: 'https://play.google.com/store/apps/details?id=com.spotify.music',
        region: 'US',
        locale: 'en-US',
        captureFrequencyMinutes: 60
      })
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('reactivates a paused app with an immediate next capture', async () => {
    const repository = createRepositoryFixture();
    const snapshotsRepository = createSnapshotsRepositoryFixture();
    const storage = { remove: vi.fn() };
    const existing = createMonitoredAppListItem({ isActive: false });
    const updated = createMonitoredAppRecord({ isActive: true });
    const refreshed = createMonitoredAppListItem({
      isActive: true,
      locale: 'en-GB'
    });

    repository.getById
      .mockResolvedValueOnce(existing)
      .mockResolvedValueOnce(refreshed);
    repository.update.mockResolvedValue(updated);

    const service = createMonitoredAppsService(repository as never, snapshotsRepository as never, storage as never, 'pgboss');
    const result = await service.update(existing.id, {
      locale: 'en-GB',
      isActive: true
    });

    const updateCall = repository.update.mock.calls[0] as [string, {
      locale?: string;
      isActive?: boolean;
      nextCaptureAt?: Date;
    }];

    expect(updateCall[0]).toBe(existing.id);
    expect(updateCall[1]).toMatchObject({
      locale: 'en-GB',
      isActive: true
    });
    expect(updateCall[1].nextCaptureAt).toBeInstanceOf(Date);
    expect(result.locale).toBe('en-GB');
    expect(result.isActive).toBe(true);
  });

  it('throws when the monitored app does not exist', async () => {
    const repository = createRepositoryFixture();
    const snapshotsRepository = createSnapshotsRepositoryFixture();
    const storage = { remove: vi.fn() };
    repository.getById.mockResolvedValue(null);

    const service = createMonitoredAppsService(repository as never, snapshotsRepository as never, storage as never, 'pgboss');

    await expect(() =>
      service.update('550e8400-e29b-41d4-a716-446655440000', { locale: 'en-GB' })
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('deletes a monitored app and removes its stored screenshots', async () => {
    const repository = createRepositoryFixture();
    const snapshotsRepository = createSnapshotsRepositoryFixture();
    const storage = {
      remove: vi.fn().mockResolvedValue(undefined)
    };
    const existing = createMonitoredAppListItem({
      title: 'Spotify: Music and Podcasts',
      snapshotCount: 2
    });

    repository.getById.mockResolvedValue(existing);
    repository.delete.mockResolvedValue(createMonitoredAppRecord());
    snapshotsRepository.listObjectKeysByMonitoredAppId.mockResolvedValue([
      'com.spotify.music/first.png',
      'com.spotify.music/second.png',
      'com.spotify.music/first.png'
    ]);

    const service = createMonitoredAppsService(repository as never, snapshotsRepository as never, storage as never, 'pgboss');
    await expect(service.delete(existing.id)).resolves.toBeUndefined();

    expect(repository.update).toHaveBeenCalledWith(existing.id, { isActive: false });
    expect(repository.deleteQueuedCaptureJobs).toHaveBeenCalledWith(existing.id, 'pgboss');
    expect(snapshotsRepository.listObjectKeysByMonitoredAppId).toHaveBeenCalledWith(existing.id);
    expect(repository.delete).toHaveBeenCalledWith(existing.id);
    expect(storage.remove).toHaveBeenCalledTimes(2);
  });

  it('deletes a monitored app even when one screenshot cleanup fails', async () => {
    const repository = createRepositoryFixture();
    const snapshotsRepository = createSnapshotsRepositoryFixture();
    const storage = {
      remove: vi.fn()
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('remove failed'))
    };
    const existing = createMonitoredAppListItem();
    const consoleErrorMock = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    repository.getById.mockResolvedValue(existing);
    repository.delete.mockResolvedValue(createMonitoredAppRecord());
    snapshotsRepository.listObjectKeysByMonitoredAppId.mockResolvedValue([
      'com.example.app/first.png',
      'com.example.app/second.png'
    ]);

    const service = createMonitoredAppsService(repository as never, snapshotsRepository as never, storage as never, 'pgboss');
    await expect(service.delete(existing.id)).resolves.toBeUndefined();

    expect(repository.delete).toHaveBeenCalledWith(existing.id);
    expect(storage.remove).toHaveBeenCalledTimes(2);
    expect(consoleErrorMock).toHaveBeenCalledWith(
      'Failed to remove screenshot during monitored app deletion.',
      expect.objectContaining({
        monitoredAppId: existing.id,
        objectKey: 'com.example.app/second.png'
      })
    );

    consoleErrorMock.mockRestore();
  });
});
