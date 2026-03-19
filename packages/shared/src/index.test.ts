import { describe, expect, it } from 'vitest';

import { buildGooglePlayListingUrl, normalizeGooglePlayUrl, snapshotQuerySchema } from './index.js';

describe('normalizeGooglePlayUrl', () => {
  it('extracts package id and strips extra params', () => {
    expect(
      normalizeGooglePlayUrl('https://play.google.com/store/apps/details?id=com.example.app&hl=en&gl=US')
    ).toEqual({
      packageId: 'com.example.app',
      normalizedUrl: 'https://play.google.com/store/apps/details?id=com.example.app'
    });
  });

  it('rejects invalid package ids', () => {
    expect(() =>
      normalizeGooglePlayUrl('https://play.google.com/store/apps/details?id=../../../etc/passwd')
    ).toThrow('Invalid Android package name.');
  });
});

describe('buildGooglePlayListingUrl', () => {
  it('builds a locale-aware listing url', () => {
    expect(
      buildGooglePlayListingUrl({
        packageId: 'com.example.app',
        region: 'US',
        locale: 'en-US'
      })
    ).toBe('https://play.google.com/store/apps/details?id=com.example.app&gl=US&hl=en_US');
  });
});

describe('snapshotQuerySchema', () => {
  it('rejects inverted date ranges', () => {
    expect(() =>
      snapshotQuerySchema.parse({
        from: '2026-03-19T12:00:00.000Z',
        to: '2026-03-18T12:00:00.000Z'
      })
    ).toThrow('`from` must be earlier than or equal to `to`.');
  });
});
