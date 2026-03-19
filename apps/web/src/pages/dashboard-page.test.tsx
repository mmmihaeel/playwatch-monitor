/* @vitest-environment jsdom */
import { Route, Routes } from 'react-router-dom';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { MonitoredAppDto } from '@playwatch/shared';

import { renderWithProviders } from '../test/render.js';
import { DashboardPage } from './dashboard-page.js';

vi.mock('../lib/api.js', () => ({
  ApiError: class ApiError extends Error {},
  buildDashboardSummary: (monitoredApps: MonitoredAppDto[]) => ({
    monitoredApps: monitoredApps.length,
    activeApps: monitoredApps.filter((app) => app.isActive).length,
    totalSnapshots: monitoredApps.reduce((total, app) => total + app.snapshotCount, 0)
  }),
  createMonitoredApp: vi.fn(),
  getMonitoredApps: vi.fn()
}));

const { createMonitoredApp, getMonitoredApps } = await import('../lib/api.js');
const getMonitoredAppsMock = vi.mocked(getMonitoredApps);
const createMonitoredAppMock = vi.mocked(createMonitoredApp);
const scrollIntoViewMock = vi.fn();

afterEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});

beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    value: scrollIntoViewMock
  });
});

describe('DashboardPage', () => {
  it('renders summary cards from monitored apps data', async () => {
    getMonitoredAppsMock.mockResolvedValue([
      {
        id: '550e8400-e29b-41d4-a716-446655440000',
        packageId: 'com.spotify.music',
        title: 'Spotify',
        sourceUrl: 'https://play.google.com/store/apps/details?id=com.spotify.music',
        region: 'US',
        locale: 'en-US',
        captureFrequencyMinutes: 60,
        nextCaptureAt: '2026-03-19T08:00:00.000Z',
        lastAttemptAt: '2026-03-19T07:00:00.000Z',
        lastSuccessAt: '2026-03-19T07:00:00.000Z',
        isActive: true,
        snapshotCount: 3,
        createdAt: '2026-03-19T06:00:00.000Z',
        updatedAt: '2026-03-19T07:00:00.000Z'
      },
      {
        id: '660e8400-e29b-41d4-a716-446655440000',
        packageId: 'com.whatsapp',
        title: null,
        sourceUrl: 'https://play.google.com/store/apps/details?id=com.whatsapp',
        region: 'GB',
        locale: 'en-GB',
        captureFrequencyMinutes: 15,
        nextCaptureAt: '2026-03-19T08:15:00.000Z',
        lastAttemptAt: null,
        lastSuccessAt: null,
        isActive: false,
        snapshotCount: 1,
        createdAt: '2026-03-19T06:30:00.000Z',
        updatedAt: '2026-03-19T06:30:00.000Z'
      }
    ]);

    renderWithProviders(<DashboardPage />);

    await screen.findByRole('link', { name: /Spotify/i });

    expect(screen.getAllByText('Monitored apps')).toHaveLength(2);
    expect(screen.getByText('Active monitors')).toBeInTheDocument();
    expect(screen.getByText('Captured screenshots')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Open latest app page/i })).toHaveAttribute(
      'href',
      '/apps/550e8400-e29b-41d4-a716-446655440000'
    );
  });

  it('creates a monitored app and navigates to its detail page', async () => {
    getMonitoredAppsMock.mockResolvedValue([]);
    createMonitoredAppMock.mockResolvedValue({
      id: '770e8400-e29b-41d4-a716-446655440000',
      packageId: 'com.spotify.music',
      title: null,
      sourceUrl: 'https://play.google.com/store/apps/details?id=com.spotify.music',
      region: 'US',
      locale: 'en-US',
      captureFrequencyMinutes: 60,
      nextCaptureAt: '2026-03-19T08:00:00.000Z',
      lastAttemptAt: null,
      lastSuccessAt: null,
      isActive: true,
      snapshotCount: 0,
      createdAt: '2026-03-19T07:00:00.000Z',
      updatedAt: '2026-03-19T07:00:00.000Z'
    });

    renderWithProviders(
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/apps/:appId" element={<div>detail route</div>} />
      </Routes>,
      {
        initialEntries: ['/']
      }
    );

    fireEvent.change(screen.getByRole('textbox', { name: /Google Play URL/i }), {
      target: {
        value: 'https://play.google.com/store/apps/details?id=com.spotify.music'
      }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Start monitoring' }));

    await waitFor(() => {
      expect(createMonitoredAppMock).toHaveBeenCalled();
      expect(createMonitoredAppMock.mock.calls[0]?.[0]).toEqual({
        sourceUrl: 'https://play.google.com/store/apps/details?id=com.spotify.music',
        region: 'US',
        locale: 'en-US',
        captureFrequencyMinutes: 60
      });
    });
    await screen.findByText('detail route');
  });

  it('highlights and focuses the create form when the hero CTA is pressed', async () => {
    getMonitoredAppsMock.mockResolvedValue([]);
    createMonitoredAppMock.mockResolvedValue({
      id: '770e8400-e29b-41d4-a716-446655440000',
      packageId: 'com.spotify.music',
      title: null,
      sourceUrl: 'https://play.google.com/store/apps/details?id=com.spotify.music',
      region: 'US',
      locale: 'en-US',
      captureFrequencyMinutes: 60,
      nextCaptureAt: '2026-03-19T08:00:00.000Z',
      lastAttemptAt: null,
      lastSuccessAt: null,
      isActive: true,
      snapshotCount: 0,
      createdAt: '2026-03-19T07:00:00.000Z',
      updatedAt: '2026-03-19T07:00:00.000Z'
    });

    renderWithProviders(<DashboardPage />);

    const cta = screen.getByRole('link', { name: 'Create monitored app' });
    const formRegion = screen.getByRole('region', { name: 'Add monitored app' });
    const sourceUrlInput = screen.getByRole('textbox', { name: /Google Play URL/i });

    fireEvent.click(cta);

    await waitFor(() => {
      expect(scrollIntoViewMock).toHaveBeenCalled();
      expect(sourceUrlInput).toHaveFocus();
      expect(formRegion).toHaveClass('create-form-spotlight');
    }, { timeout: 1_000 });
  });
});
