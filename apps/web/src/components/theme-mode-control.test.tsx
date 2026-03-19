/* @vitest-environment jsdom */
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { renderWithProviders } from '../test/render.js';
import { themePreferenceStorageKey } from '../theme/theme-preference.js';
import { ThemeModeControl } from './theme-mode-control.js';

describe('ThemeModeControl', () => {
  it('persists the selected preference and updates the document appearance', () => {
    renderWithProviders(<ThemeModeControl />);

    fireEvent.click(screen.getByRole('button', { name: 'Dark' }));

    expect(window.localStorage.getItem(themePreferenceStorageKey)).toBe('dark');
    expect(document.documentElement.dataset.appearance).toBe('dark');
    expect(document.documentElement).not.toHaveAttribute('style');

    fireEvent.click(screen.getByRole('button', { name: 'Auto' }));

    expect(window.localStorage.getItem(themePreferenceStorageKey)).toBe('system');
    expect(document.documentElement.dataset.appearance).toBe('light');
    expect(document.documentElement).not.toHaveAttribute('style');
  });
});
