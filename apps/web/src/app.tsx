import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';

import { ThemeModeControl } from './components/theme-mode-control.js';
import { DashboardPage } from './pages/dashboard-page.js';
import { MonitoredAppPage } from './pages/monitored-app-page.js';
import { ThemePreferenceProvider, useThemePreference } from './theme/theme-preference.js';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false
    }
  }
});

export function App() {
  return (
    <ThemePreferenceProvider>
      <AppShell />
    </ThemePreferenceProvider>
  );
}

function AppShell() {
  useThemePreference();

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <div className="min-h-screen">
          <ThemeModeControl />
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/apps/:appId" element={<MonitoredAppPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
