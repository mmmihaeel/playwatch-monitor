/* @vitest-environment jsdom */
import { Route, Routes } from 'react-router-dom';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { renderWithProviders } from '../test/render.js';
import { MonitoredAppPage } from './monitored-app-page.js';

vi.mock('../lib/api.js', () => ({
  ApiError: class ApiError extends Error {},
  deleteMonitoredApp: vi.fn(),
  getMonitoredApps: vi.fn(),
  getMonitoredApp: vi.fn(),
  getSnapshots: vi.fn(),
  updateMonitoredApp: vi.fn()
}));

const { deleteMonitoredApp, getMonitoredApp, getMonitoredApps, getSnapshots, updateMonitoredApp } = await import('../lib/api.js');
const deleteMonitoredAppMock = vi.mocked(deleteMonitoredApp);
const getMonitoredAppsMock = vi.mocked(getMonitoredApps);
const getMonitoredAppMock = vi.mocked(getMonitoredApp);
const getSnapshotsMock = vi.mocked(getSnapshots);
const updateMonitoredAppMock = vi.mocked(updateMonitoredApp);

const monitoredAppFixture = {
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
  snapshotCount: 1,
  createdAt: '2026-03-19T06:00:00.000Z',
  updatedAt: '2026-03-19T07:00:00.000Z'
} as const;

afterEach(() => {
  vi.clearAllMocks();
});

describe('MonitoredAppPage', () => {
  it('updates a monitored app from the edit dialog', async () => {
    const updatedFixture = {
      ...monitoredAppFixture,
      locale: 'en-GB'
    };

    getMonitoredAppsMock.mockResolvedValue([updatedFixture]);
    getMonitoredAppMock.mockResolvedValueOnce(monitoredAppFixture).mockResolvedValue(updatedFixture);
    getSnapshotsMock.mockResolvedValue([]);
    deleteMonitoredAppMock.mockResolvedValue(undefined);
    updateMonitoredAppMock.mockResolvedValue(updatedFixture);

    renderWithProviders(
      <Routes>
        <Route path="/apps/:appId" element={<MonitoredAppPage />} />
      </Routes>,
      {
        initialEntries: ['/apps/550e8400-e29b-41d4-a716-446655440000']
      }
    );

    await screen.findByRole('button', { name: 'Edit settings' });
    expect(screen.getByText('Region')).toBeInTheDocument();
    expect(screen.getByText('US')).toBeInTheDocument();
    expect(screen.getByText('Locale')).toBeInTheDocument();
    expect(screen.getByText('en-US')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Edit settings' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Locale' }), {
      target: {
        value: 'en-GB'
      }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => {
      expect(updateMonitoredAppMock).toHaveBeenCalledWith(
        monitoredAppFixture.id,
        expect.objectContaining({
          locale: 'en-GB'
        })
      );
    });
    await screen.findByText('en-GB');
  });

  it('re-queries snapshots when the status filter changes', async () => {
    getMonitoredAppsMock.mockResolvedValue([monitoredAppFixture]);
    getMonitoredAppMock.mockResolvedValue(monitoredAppFixture);
    getSnapshotsMock.mockResolvedValue([]);
    deleteMonitoredAppMock.mockResolvedValue(undefined);
    updateMonitoredAppMock.mockResolvedValue(monitoredAppFixture);

    renderWithProviders(
      <Routes>
        <Route path="/apps/:appId" element={<MonitoredAppPage />} />
      </Routes>,
      {
        initialEntries: ['/apps/550e8400-e29b-41d4-a716-446655440000']
      }
    );

    const statusFilters = await screen.findAllByRole('combobox', {
      name: 'Capture status filter'
    });
    const statusFilter = statusFilters[0];

    expect(statusFilter).toBeDefined();

    fireEvent.change(statusFilter as HTMLElement, {
      target: {
        value: 'failed'
      }
    });

    await waitFor(() => {
      expect(getSnapshotsMock).toHaveBeenLastCalledWith(
        {
          monitoredAppId: monitoredAppFixture.id,
          status: 'failed',
          changed: 'all'
        },
        expect.any(AbortSignal)
      );
    });
  });

  it('deletes a monitored app from the confirmation dialog', async () => {
    getMonitoredAppsMock.mockResolvedValue([monitoredAppFixture]);
    getMonitoredAppMock.mockResolvedValue(monitoredAppFixture);
    getSnapshotsMock.mockResolvedValue([]);
    deleteMonitoredAppMock.mockResolvedValue(undefined);
    updateMonitoredAppMock.mockResolvedValue(monitoredAppFixture);

    renderWithProviders(
      <Routes>
        <Route path="/" element={<div>dashboard route</div>} />
        <Route path="/apps/:appId" element={<MonitoredAppPage />} />
      </Routes>,
      {
        initialEntries: ['/apps/550e8400-e29b-41d4-a716-446655440000']
      }
    );

    await screen.findByRole('button', { name: 'Delete app' });
    fireEvent.click(screen.getByRole('button', { name: 'Delete app' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete monitored app' }));

    await waitFor(() => {
      expect(deleteMonitoredAppMock).toHaveBeenCalledWith(monitoredAppFixture.id);
    });
    await screen.findByText('dashboard route');
  });
});
