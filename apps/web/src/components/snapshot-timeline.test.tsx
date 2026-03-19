/* @vitest-environment jsdom */
import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';

import { SnapshotTimeline } from './snapshot-timeline.js';
import { renderWithProviders } from '../test/render.js';

describe('SnapshotTimeline', () => {
  it('renders screenshot previews and failure states', () => {
    renderWithProviders(
      <SnapshotTimeline
        snapshots={[
          {
            id: 'snapshot-1',
            monitoredAppId: 'app-1',
            objectKey: 'com.example.app/example.png',
            imageUrl: '/assets/screenshots/com.example.app/example.png',
            capturedAt: '2026-03-18T12:00:00.000Z',
            status: 'success',
            contentHash: 'hash',
            changedFromPrevious: true,
            previousSnapshotId: null,
            failureReason: null
          },
          {
            id: 'snapshot-2',
            monitoredAppId: 'app-1',
            objectKey: null,
            imageUrl: null,
            capturedAt: '2026-03-18T13:00:00.000Z',
            status: 'failed',
            contentHash: null,
            changedFromPrevious: null,
            previousSnapshotId: null,
            failureReason: 'Timeout'
          }
        ]}
      />
    );

    expect(screen.getByAltText(/Google Play listing captured/i)).toBeInTheDocument();
    expect(screen.getByText('Timeout')).toBeInTheDocument();
  });
});
