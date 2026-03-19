import { createHash } from 'node:crypto';

import type { AppConfig } from '@playwatch/config';
import type { MonitoredAppsRepository, SnapshotsRepository } from '@playwatch/db';
import type { StorageAdapter } from '@playwatch/storage';
import { buildScreenshotObjectKey } from '@playwatch/shared';

import { capturePlayStoreListing } from '../lib/capture-play-store.js';

const RETRIABLE_CAPTURE_ERROR_PATTERNS = [
  'ERR_SOCKET_NOT_CONNECTED',
  'ERR_CONNECTION_RESET',
  'ERR_NETWORK_CHANGED',
  'ERR_TIMED_OUT',
  'ERR_INTERNET_DISCONNECTED'
];
const PLAYWRIGHT_BROWSER_MISSING_PATTERN = 'Executable doesn\'t exist';
const GOOGLE_PLAY_TIMEOUT_PATTERN = 'Timeout';
const FAILURE_RETRY_MINUTES = 5;
const MAX_FAILURE_REASON_LENGTH = 280;

function isRetriableCaptureError(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  return RETRIABLE_CAPTURE_ERROR_PATTERNS.some((pattern) => error.message.includes(pattern));
}

function formatFailureReason(error: unknown) {
  if (!(error instanceof Error)) {
    return 'Unknown capture error.';
  }

  if (error.message.includes(PLAYWRIGHT_BROWSER_MISSING_PATTERN)) {
    return 'Worker browser runtime is unavailable. Rebuild the worker image with Playwright browsers installed.';
  }

  if (isRetriableCaptureError(error)) {
    return 'Transient network error while loading the Google Play listing.';
  }

  if (error.message.includes(GOOGLE_PLAY_TIMEOUT_PATTERN)) {
    return 'Timed out while loading the Google Play listing.';
  }

  const message = error.message;
  const summary = message
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => Boolean(line) && !line.includes('/root/.cache/ms-playwright'))
    .slice(0, 1)
    .join(' ')
    .replace(/\s+/g, ' ');

  if (summary.length <= MAX_FAILURE_REASON_LENGTH) {
    return summary;
  }

  return `${summary.slice(0, MAX_FAILURE_REASON_LENGTH - 3)}...`;
}

function buildFailureRetryDate(capturedAt: Date, captureFrequencyMinutes: number) {
  const retryDelayMinutes = Math.min(captureFrequencyMinutes, FAILURE_RETRY_MINUTES);
  return new Date(capturedAt.getTime() + retryDelayMinutes * 60_000);
}

export async function captureListingJob(input: {
  config: AppConfig;
  monitoredAppsRepository: MonitoredAppsRepository;
  snapshotsRepository: SnapshotsRepository;
  storage: StorageAdapter;
  monitoredAppId: string;
}) {
  const monitoredApp = await input.monitoredAppsRepository.getById(input.monitoredAppId);

  if (!monitoredApp) {
    return null;
  }

  const capturedAt = new Date();

  try {
    let capture: Awaited<ReturnType<typeof capturePlayStoreListing>> | null = null;

    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        capture = await capturePlayStoreListing({
          packageId: monitoredApp.packageId,
          region: monitoredApp.region,
          locale: monitoredApp.locale,
          headless: input.config.PLAYWRIGHT_HEADLESS,
          timeoutMs: input.config.PLAYWRIGHT_TIMEOUT_MS
        });
        break;
      } catch (error) {
        if (attempt === 2 || !isRetriableCaptureError(error)) {
          throw error;
        }
      }
    }

    if (!capture) {
      throw new Error('Capture did not produce a result.');
    }

    const latestMonitoredApp = await input.monitoredAppsRepository.getById(input.monitoredAppId);

    if (!latestMonitoredApp || !latestMonitoredApp.isActive) {
      return null;
    }

    const objectKey = buildScreenshotObjectKey(monitoredApp.packageId, capturedAt);
    const contentHash = createHash('sha256').update(capture.buffer).digest('hex');

    await input.storage.save(objectKey, capture.buffer, {
      contentType: 'image/png'
    });

    try {
      return await input.snapshotsRepository.recordSuccess({
        monitoredAppId: monitoredApp.id,
        title: capture.title,
        objectKey,
        capturedAt,
        contentHash
      });
    } catch (error) {
      await input.storage.remove(objectKey);

      const refreshedMonitoredApp = await input.monitoredAppsRepository.getById(input.monitoredAppId);
      if (!refreshedMonitoredApp) {
        return null;
      }

      throw error;
    }
  } catch (error) {
    console.error('Failed to capture Google Play listing.', {
      monitoredAppId: monitoredApp.id,
      packageId: monitoredApp.packageId,
      error
    });

    const failureReason = formatFailureReason(error);
    const currentMonitoredApp = await input.monitoredAppsRepository.getById(input.monitoredAppId);

    if (!currentMonitoredApp || !currentMonitoredApp.isActive) {
      return null;
    }

    const snapshot = await input.snapshotsRepository.recordFailure({
      monitoredAppId: monitoredApp.id,
      capturedAt,
      failureReason
    });

    await input.monitoredAppsRepository.update(monitoredApp.id, {
      nextCaptureAt: buildFailureRetryDate(capturedAt, currentMonitoredApp.captureFrequencyMinutes)
    });

    return snapshot;
  }
}
