import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter } from 'react-router-dom';

import { ThemePreferenceProvider } from '../theme/theme-preference.js';

export function renderWithProviders(
  ui: ReactElement,
  options?: {
    initialEntries?: string[];
  }
): ReturnType<typeof render> {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false
      }
    }
  });

  return render(
    <ThemePreferenceProvider initialPreference="light">
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={options?.initialEntries}>{ui}</MemoryRouter>
      </QueryClientProvider>
    </ThemePreferenceProvider>
  );
}
