import { startTransition } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link as RouterLink, useNavigate } from 'react-router-dom';

import { AppsList } from '../components/apps-list.js';
import { MonitoredAppForm } from '../components/monitored-app-form.js';
import { buildDashboardSummary, createMonitoredApp, getMonitoredApps } from '../lib/api.js';

export function DashboardPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const monitoredAppsQuery = useQuery({
    queryKey: ['monitored-apps'],
    queryFn: getMonitoredApps,
    refetchInterval: 30_000
  });

  const createMutation = useMutation({
    mutationFn: createMonitoredApp,
    onSuccess: async (createdApp) => {
      await queryClient.invalidateQueries({ queryKey: ['monitored-apps'] });
      startTransition(() => {
        void navigate(`/apps/${createdApp.id}`);
      });
    }
  });

  const summary = buildDashboardSummary(monitoredAppsQuery.data ?? []);

  return (
    <div className="page-shell">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-5">
          <section className="hero-panel">
            <div className="flex flex-col gap-4">
              <p className="eyebrow">PlayWatch monitoring console</p>
              <h1 className="hero-title">Track Google Play listing changes before your competitors do.</h1>
              <p className="hero-copy">
                Register an Android app once, let the worker capture listing screenshots on a schedule, and review every shift in one timeline-oriented monitoring view.
              </p>
              <div className="flex flex-wrap gap-3">
                <a href="#create-app" className="button-primary">
                  Create monitored app
                </a>
                {monitoredAppsQuery.data?.[0] ? (
                  <RouterLink className="button-secondary" to={`/apps/${monitoredAppsQuery.data[0].id}`}>
                    Open latest app page
                  </RouterLink>
                ) : null}
              </div>
            </div>
          </section>

          <div className="grid gap-3 sm:grid-cols-3">
            <StatCard label="Monitored apps" value={`${summary.monitoredApps}`} />
            <StatCard label="Active monitors" value={`${summary.activeApps}`} />
            <StatCard label="Captured screenshots" value={`${summary.totalSnapshots}`} />
          </div>

          <div id="create-app">
            <MonitoredAppForm
              title="Add monitored app"
              description="Paste the Google Play URL, choose the market context, and start collecting evidence immediately."
              submitLabel="Start monitoring"
              submitPendingLabel="Creating..."
              helperText="First screenshot is scheduled immediately after creation."
              defaultValues={{
                sourceUrl: '',
                region: 'US',
                locale: 'en-US',
                captureFrequencyMinutes: 60,
                isActive: true
              }}
              onSubmit={async (values) => {
                await createMutation.mutateAsync({
                  sourceUrl: values.sourceUrl,
                  region: values.region,
                  locale: values.locale,
                  captureFrequencyMinutes: values.captureFrequencyMinutes
                });
              }}
            />
          </div>
        </div>

        <aside className="surface-panel flex min-h-[680px] flex-col gap-4 rounded-[30px] px-6 py-6">
          <div className="space-y-2">
            <p className="section-title">Monitored apps</p>
            <p className="muted-copy">Open a detail page to inspect screenshot history, filters, and capture timing.</p>
          </div>

          {monitoredAppsQuery.isLoading ? (
            <div className="flex flex-col gap-3">
              <div className="skeleton-block h-[92px] w-full" />
              <div className="skeleton-block h-[92px] w-full" />
              <div className="skeleton-block h-[92px] w-full" />
            </div>
          ) : monitoredAppsQuery.isError ? (
            <div className="surface-panel rounded-[24px] px-5 py-5">
              <p className="text-sm font-medium text-rose-600 dark:text-rose-400">
                {monitoredAppsQuery.error instanceof Error
                  ? monitoredAppsQuery.error.message
                  : 'Failed to load monitored apps.'}
              </p>
            </div>
          ) : (
            <AppsList apps={monitoredAppsQuery.data ?? []} />
          )}
        </aside>
      </div>
    </div>
  );
}

function StatCard(props: { label: string; value: string }) {
  return (
    <section className="surface-panel rounded-[24px] px-5 py-5">
      <div className="flex flex-col gap-2">
        <p className="text-sm text-slate-500 dark:text-slate-400">{props.label}</p>
        <p className="text-4xl font-semibold tracking-[-0.04em]">{props.value}</p>
      </div>
    </section>
  );
}
