/* @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => {
  vi.resetModules();
  window.history.replaceState({}, '', 'http://localhost:3000/');
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  window.history.replaceState({}, '', 'http://localhost:3000/');
});

describe('resolveAssetUrl', () => {
  it('resolves relative asset paths against the API origin', async () => {
    const { resolveAssetUrl } = await import('./api.js');

    expect(resolveAssetUrl('/assets/screenshots/com.example.app/test.png')).toBe(
      'http://localhost:4000/assets/screenshots/com.example.app/test.png'
    );
  });

  it('resolves relative asset paths against the current origin when the API base url is proxied', async () => {
    vi.stubEnv('VITE_API_BASE_URL', '/api');
    window.history.replaceState({}, '', 'http://localhost:3000/apps/spotify');

    const { resolveAssetUrl } = await import('./api.js');

    expect(resolveAssetUrl('/assets/screenshots/com.example.app/test.png')).toBe(
      'http://localhost:3000/assets/screenshots/com.example.app/test.png'
    );
  });
});

describe('buildDashboardSummary', () => {
  it('aggregates app and snapshot counters', async () => {
    const { buildDashboardSummary } = await import('./api.js');

    expect(
      buildDashboardSummary([
        { snapshotCount: 2, isActive: true },
        { snapshotCount: 5, isActive: false }
      ] as never)
    ).toEqual({
      monitoredApps: 2,
      activeApps: 1,
      totalSnapshots: 7
    });
  });
});

describe('deleteMonitoredApp', () => {
  it('does not send a JSON content-type header for bodyless delete requests', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 204,
      json: vi.fn().mockRejectedValue(new Error('no content'))
    });

    vi.stubGlobal('fetch', fetchMock);

    const { deleteMonitoredApp } = await import('./api.js');
    await expect(deleteMonitoredApp('550e8400-e29b-41d4-a716-446655440000')).resolves.toBeUndefined();

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const headers = new Headers(init.headers);

    expect(init.method).toBe('DELETE');
    expect(headers.has('Content-Type')).toBe(false);
  });
});

describe('deleteMonitoredApp', () => {
  it('treats a 204 response as a successful deletion', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 204,
      json: vi.fn().mockRejectedValue(new Error('no content'))
    });

    vi.stubGlobal('fetch', fetchMock);

    const { deleteMonitoredApp } = await import('./api.js');

    await expect(deleteMonitoredApp('550e8400-e29b-41d4-a716-446655440000')).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:4000/api/monitored-apps/550e8400-e29b-41d4-a716-446655440000',
      expect.objectContaining({
        method: 'DELETE'
      })
    );
  });
});
