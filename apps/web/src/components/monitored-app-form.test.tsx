/* @vitest-environment jsdom */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';

import { MonitoredAppForm } from './monitored-app-form.js';
import { renderWithProviders } from '../test/render.js';

describe('MonitoredAppForm', () => {
  it('submits validated values through a real form', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);

    renderWithProviders(
      <MonitoredAppForm
        title="Add monitored app"
        description="Track competitor listings."
        submitLabel="Add app"
        submitPendingLabel="Adding..."
        defaultValues={{
          sourceUrl: 'https://play.google.com/store/apps/details?id=com.example.app',
          region: 'US',
          locale: 'en-US',
          captureFrequencyMinutes: 60,
          isActive: true
        }}
        onSubmit={onSubmit}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Add app' }));

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        sourceUrl: 'https://play.google.com/store/apps/details?id=com.example.app',
        region: 'US',
        locale: 'en-US',
        captureFrequencyMinutes: 60,
        isActive: true
      })
    );
  });
});
