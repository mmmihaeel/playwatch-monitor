import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AppConfig } from '@playwatch/config';

import { capturePlayStoreListing } from '../lib/capture-play-store.js';
import { captureListingJob } from './capture-listing.js';

vi.mock('../lib/capture-play-store.js', () => ({
  capturePlayStoreListing: vi.fn()
}));

const capturePlayStoreListingMock = vi.mocked(capturePlayStoreListing);
const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

const config: AppConfig = {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/playwatch',
  API_HOST: '127.0.0.1',
  API_PORT: 4000,
  API_TRUST_PROXY: false,
  WEB_PORT: 3000,
  WEB_ORIGIN: 'http://localhost:3000',
  CORS_ORIGINS: ['http://localhost:3000', 'http://127.0.0.1:3000'],
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

afterEach(() => {
  vi.clearAllMocks();
});

describe('captureListingJob', () => {
  it('stores a successful capture and persists metadata', async () => {
    capturePlayStoreListingMock.mockResolvedValue({
      title: 'Example title',
      buffer: Buffer.from('png-data')
    });

    const monitoredAppsRepository = {
      getById: vi.fn()
        .mockResolvedValueOnce({
          id: 'app-1',
          packageId: 'com.example.app',
          region: 'US',
          locale: 'en-US',
          captureFrequencyMinutes: 60,
          isActive: true
        })
        .mockResolvedValueOnce({
          id: 'app-1',
          packageId: 'com.example.app',
          region: 'US',
          locale: 'en-US',
          captureFrequencyMinutes: 60,
          isActive: true
        })
    };
    const snapshotsRepository = {
      recordSuccess: vi.fn().mockResolvedValue({ id: 'snapshot-1' }),
      recordFailure: vi.fn()
    };
    const storage = {
      save: vi.fn().mockResolvedValue(undefined),
      read: vi.fn(),
      remove: vi.fn()
    };

    await captureListingJob({
      config,
      monitoredAppsRepository: monitoredAppsRepository as never,
      snapshotsRepository: snapshotsRepository as never,
      storage,
      monitoredAppId: 'app-1'
    });

    expect(storage.save).toHaveBeenCalledTimes(1);
    expect(snapshotsRepository.recordSuccess).toHaveBeenCalledTimes(1);
    expect(snapshotsRepository.recordFailure).not.toHaveBeenCalled();
    expect(monitoredAppsRepository.getById).toHaveBeenCalledTimes(2);
    expect(monitoredAppsRepository.getById).toHaveBeenCalledWith('app-1');
  });

  it('records failures with a retry-at timestamp and sanitized message', async () => {
    capturePlayStoreListingMock.mockRejectedValue(
      new Error([
        'browserType.launch: Executable does not exist',
        'Please run the following command to download new browsers:',
        'npx playwright install',
        'Additional diagnostics'
      ].join('\n'))
    );

    const monitoredAppsRepository = {
      getById: vi.fn()
        .mockResolvedValueOnce({
          id: 'app-1',
          packageId: 'com.example.app',
          region: 'US',
          locale: 'en-US',
          captureFrequencyMinutes: 60,
          isActive: true
        })
        .mockResolvedValueOnce({
          id: 'app-1',
          packageId: 'com.example.app',
          region: 'US',
          locale: 'en-US',
          captureFrequencyMinutes: 60,
          isActive: true
        }),
      update: vi.fn().mockResolvedValue({ id: 'app-1' })
    };
    const snapshotsRepository = {
      recordSuccess: vi.fn(),
      recordFailure: vi.fn().mockResolvedValue({ id: 'snapshot-failed' })
    };
    const storage = {
      save: vi.fn(),
      read: vi.fn(),
      remove: vi.fn()
    };

    await captureListingJob({
      config,
      monitoredAppsRepository: monitoredAppsRepository as never,
      snapshotsRepository: snapshotsRepository as never,
      storage,
      monitoredAppId: 'app-1'
    });

    expect(snapshotsRepository.recordSuccess).not.toHaveBeenCalled();
    expect(snapshotsRepository.recordFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        monitoredAppId: 'app-1',
        failureReason: 'Worker browser runtime is unavailable. Rebuild the worker image with Playwright browsers installed.'
      })
    );
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Failed to capture Google Play listing.',
      expect.objectContaining({
        monitoredAppId: 'app-1',
        packageId: 'com.example.app'
      })
    );
    const [, loggedErrorContext] = consoleErrorSpy.mock.calls[0] as [string, unknown];

    expect(loggedErrorContext).toBeTruthy();
    expect(typeof loggedErrorContext).toBe('object');
    expect(loggedErrorContext).toHaveProperty('error');

    if (!loggedErrorContext || typeof loggedErrorContext !== 'object' || !('error' in loggedErrorContext)) {
      throw new Error('Expected logged error context to include an error.');
    }

    expect(loggedErrorContext.error).toBeInstanceOf(Error);
    const updateCall = monitoredAppsRepository.update.mock.calls[0] as [string, {
      nextCaptureAt?: Date;
    }];

    expect(monitoredAppsRepository.getById).toHaveBeenCalledTimes(2);
    expect(updateCall[0]).toBe('app-1');
    expect(updateCall[1].nextCaptureAt).toBeInstanceOf(Date);
  });

  it('returns null when the monitored app is already gone', async () => {
    const monitoredAppsRepository = {
      getById: vi.fn().mockResolvedValue(null),
      update: vi.fn()
    };
    const snapshotsRepository = {
      recordSuccess: vi.fn(),
      recordFailure: vi.fn()
    };
    const storage = {
      save: vi.fn(),
      read: vi.fn(),
      remove: vi.fn()
    };

    const result = await captureListingJob({
      config,
      monitoredAppsRepository: monitoredAppsRepository as never,
      snapshotsRepository: snapshotsRepository as never,
      storage,
      monitoredAppId: 'app-1'
    });

    expect(result).toBeNull();
    expect(storage.save).not.toHaveBeenCalled();
    expect(snapshotsRepository.recordFailure).not.toHaveBeenCalled();
  });

  it('drops a successful capture when the monitored app disappears before persistence', async () => {
    capturePlayStoreListingMock.mockResolvedValue({
      title: 'Example title',
      buffer: Buffer.from('png-data')
    });

    const monitoredAppsRepository = {
      getById: vi.fn()
        .mockResolvedValueOnce({
          id: 'app-1',
          packageId: 'com.example.app',
          region: 'US',
          locale: 'en-US',
          captureFrequencyMinutes: 60,
          isActive: true
        })
        .mockResolvedValueOnce(null)
    };
    const snapshotsRepository = {
      recordSuccess: vi.fn(),
      recordFailure: vi.fn()
    };
    const storage = {
      save: vi.fn().mockResolvedValue(undefined),
      read: vi.fn(),
      remove: vi.fn()
    };

    const result = await captureListingJob({
      config,
      monitoredAppsRepository: monitoredAppsRepository as never,
      snapshotsRepository: snapshotsRepository as never,
      storage,
      monitoredAppId: 'app-1'
    });

    expect(result).toBeNull();
    expect(storage.save).not.toHaveBeenCalled();
    expect(snapshotsRepository.recordSuccess).not.toHaveBeenCalled();
  });

  it('removes a screenshot if persistence fails after the file is saved', async () => {
    capturePlayStoreListingMock.mockResolvedValue({
      title: 'Example title',
      buffer: Buffer.from('png-data')
    });

    const monitoredAppsRepository = {
      getById: vi.fn()
        .mockResolvedValueOnce({
          id: 'app-1',
          packageId: 'com.example.app',
          region: 'US',
          locale: 'en-US',
          captureFrequencyMinutes: 60,
          isActive: true
        })
        .mockResolvedValueOnce({
          id: 'app-1',
          packageId: 'com.example.app',
          region: 'US',
          locale: 'en-US',
          captureFrequencyMinutes: 60,
          isActive: true
        })
        .mockResolvedValueOnce(null),
      update: vi.fn()
    };
    const snapshotsRepository = {
      recordSuccess: vi.fn().mockRejectedValue(new Error('insert failed')),
      recordFailure: vi.fn()
    };
    const storage = {
      save: vi.fn().mockResolvedValue(undefined),
      read: vi.fn(),
      remove: vi.fn().mockResolvedValue(undefined)
    };

    const result = await captureListingJob({
      config,
      monitoredAppsRepository: monitoredAppsRepository as never,
      snapshotsRepository: snapshotsRepository as never,
      storage,
      monitoredAppId: 'app-1'
    });

    expect(result).toBeNull();
    expect(storage.save).toHaveBeenCalledTimes(1);
    expect(storage.remove).toHaveBeenCalledTimes(1);
    expect(snapshotsRepository.recordFailure).not.toHaveBeenCalled();
  });

  it('retries transient capture failures once before recording success', async () => {
    capturePlayStoreListingMock
      .mockRejectedValueOnce(new Error('page.goto: net::ERR_SOCKET_NOT_CONNECTED'))
      .mockResolvedValueOnce({
        title: 'Recovered title',
        buffer: Buffer.from('png-data')
      });

    const monitoredAppsRepository = {
      getById: vi.fn()
        .mockResolvedValueOnce({
          id: 'app-1',
          packageId: 'com.example.app',
          region: 'US',
          locale: 'en-US',
          captureFrequencyMinutes: 60,
          isActive: true
        })
        .mockResolvedValueOnce({
          id: 'app-1',
          packageId: 'com.example.app',
          region: 'US',
          locale: 'en-US',
          captureFrequencyMinutes: 60,
          isActive: true
        })
    };
    const snapshotsRepository = {
      recordSuccess: vi.fn().mockResolvedValue({ id: 'snapshot-1' }),
      recordFailure: vi.fn()
    };
    const storage = {
      save: vi.fn().mockResolvedValue(undefined),
      read: vi.fn(),
      remove: vi.fn()
    };

    await captureListingJob({
      config,
      monitoredAppsRepository: monitoredAppsRepository as never,
      snapshotsRepository: snapshotsRepository as never,
      storage,
      monitoredAppId: 'app-1'
    });

    expect(capturePlayStoreListingMock).toHaveBeenCalledTimes(2);
    expect(snapshotsRepository.recordSuccess).toHaveBeenCalledTimes(1);
    expect(snapshotsRepository.recordFailure).not.toHaveBeenCalled();
  });
});
