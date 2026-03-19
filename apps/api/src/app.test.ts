// @vitest-environment node

import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AppConfig } from '@playwatch/config';
import { createStorageAdapter } from '@playwatch/storage';
import type { ApiServices } from './services/index.js';

import { buildApp } from './app.js';
import { NotFoundError } from './errors.js';

async function createConfigFixture(): Promise<AppConfig> {
  const screenshotsDir = await mkdtemp(join(tmpdir(), 'playwatch-api-'));

  return {
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
    SCREENSHOT_STORAGE_DIR: screenshotsDir,
    STORAGE_PUBLIC_PATH: '/assets/screenshots',
    GCS_BUCKET_NAME: undefined,
    GOOGLE_PLAY_DEFAULT_REGION: 'US',
    GOOGLE_PLAY_DEFAULT_LOCALE: 'en-US',
    PG_BOSS_SCHEMA: 'pgboss',
    PLAYWRIGHT_HEADLESS: true,
    PLAYWRIGHT_TIMEOUT_MS: 60_000
  };
}

function createServicesFixture(): ApiServices {
  return {
    monitoredApps: {
      list: vi.fn().mockResolvedValue([]),
      getById: vi.fn(),
      create: vi.fn(),
      update: vi.fn()
    },
    snapshots: {
      listByMonitoredAppId: vi.fn().mockResolvedValue([])
    }
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('buildApp', () => {
  it('returns health status', async () => {
    const config = await createConfigFixture();
    const app = await buildApp({
      config,
      services: createServicesFixture(),
      storage: createStorageAdapter(config)
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/health'
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });

    await app.close();
    await rm(config.SCREENSHOT_STORAGE_DIR, { recursive: true, force: true });
  });

  it('maps zod validation errors to 400', async () => {
    const config = await createConfigFixture();
    const app = await buildApp({
      config,
      services: createServicesFixture(),
      storage: createStorageAdapter(config)
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/monitored-apps',
      payload: {
        sourceUrl: 'not-a-url'
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: 'VALIDATION_ERROR'
    });

    await app.close();
    await rm(config.SCREENSHOT_STORAGE_DIR, { recursive: true, force: true });
  });

  it('maps domain errors to the declared status code', async () => {
    const config = await createConfigFixture();
    const services = createServicesFixture();
    services.monitoredApps.getById = vi.fn().mockRejectedValue(new NotFoundError('Monitored app not found.'));

    const app = await buildApp({
      config,
      services,
      storage: createStorageAdapter(config)
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/monitored-apps/550e8400-e29b-41d4-a716-446655440000'
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      error: 'NOT_FOUND',
      message: 'Monitored app not found.'
    });

    await app.close();
    await rm(config.SCREENSHOT_STORAGE_DIR, { recursive: true, force: true });
  });

  it('allows configured loopback origins for browser clients', async () => {
    const config = await createConfigFixture();
    const app = await buildApp({
      config,
      services: createServicesFixture(),
      storage: createStorageAdapter(config)
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/health',
      headers: {
        origin: 'http://127.0.0.1:3000'
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['access-control-allow-origin']).toBe('http://127.0.0.1:3000');

    await app.close();
    await rm(config.SCREENSHOT_STORAGE_DIR, { recursive: true, force: true });
  });

  it('serves screenshots with a cross-origin resource policy that allows the web app to render them', async () => {
    const config = await createConfigFixture();
    await writeFile(join(config.SCREENSHOT_STORAGE_DIR, 'sample.png'), 'stub');

    const app = await buildApp({
      config,
      services: createServicesFixture(),
      storage: createStorageAdapter(config)
    });

    const response = await app.inject({
      method: 'GET',
      url: '/assets/screenshots/sample.png'
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['cross-origin-resource-policy']).toBe('cross-origin');

    await app.close();
    await rm(config.SCREENSHOT_STORAGE_DIR, { recursive: true, force: true });
  });

  it('allows PATCH preflight requests from configured browser origins', async () => {
    const config = await createConfigFixture();
    const app = await buildApp({
      config,
      services: createServicesFixture(),
      storage: createStorageAdapter(config)
    });

    const response = await app.inject({
      method: 'OPTIONS',
      url: '/api/monitored-apps/550e8400-e29b-41d4-a716-446655440000',
      headers: {
        origin: 'http://localhost:3000',
        'access-control-request-method': 'PATCH'
      }
    });

    expect(response.statusCode).toBe(204);
    expect(response.headers['access-control-allow-origin']).toBe('http://localhost:3000');
    expect(response.headers['access-control-allow-methods']).toContain('PATCH');

    await app.close();
    await rm(config.SCREENSHOT_STORAGE_DIR, { recursive: true, force: true });
  });
}, 15_000);
