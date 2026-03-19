/* @vitest-environment jsdom */
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { renderWithProviders } from '../test/render.js';
import { AppsList } from './apps-list.js';

describe('AppsList', () => {
  it('renders monitored app links with the active state', () => {
    renderWithProviders(
      <AppsList
        activeAppId="550e8400-e29b-41d4-a716-446655440000"
        apps={[
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
          }
        ]}
      />
    );

    const link = screen.getByRole('link', { name: /Spotify/i });

    expect(link).toHaveAttribute('href', '/apps/550e8400-e29b-41d4-a716-446655440000');
    expect(link).toHaveClass('app-list-item--active');
    expect(screen.getByText('Every hour - 3 captures')).toBeInTheDocument();
  });
});
