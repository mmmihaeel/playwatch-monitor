import { describe, expect, it } from 'vitest';

import { readConfig } from './index.js';

const baseEnv = {
  DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/playwatch'
} as const;

describe('readConfig', () => {
  it('uses the platform PORT when API_PORT is not provided', () => {
    expect(
      readConfig({
        ...baseEnv,
        PORT: '8080'
      }).API_PORT
    ).toBe(8080);
  });

  it('prefers PORT over API_PORT for container platforms that inject both', () => {
    expect(
      readConfig({
        ...baseEnv,
        PORT: '8080',
        API_PORT: '4000'
      }).API_PORT
    ).toBe(8080);
  });

  it('falls back to API_PORT when PORT is absent', () => {
    expect(
      readConfig({
        ...baseEnv,
        API_PORT: '4100'
      }).API_PORT
    ).toBe(4100);
  });

  it('requires a bucket name when the GCS storage driver is enabled', () => {
    expect(() =>
      readConfig({
        ...baseEnv,
        SCREENSHOT_STORAGE_DRIVER: 'gcs'
      })
    ).toThrow('GCS_BUCKET_NAME is required when SCREENSHOT_STORAGE_DRIVER is set to gcs.');
  });
});
