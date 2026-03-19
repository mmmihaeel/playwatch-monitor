import { useEffect, useId, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link as RouterLink, Navigate, useParams } from 'react-router-dom';

import { AppsList } from '../components/apps-list.js';
import { MonitoredAppForm } from '../components/monitored-app-form.js';
import { SnapshotFilters } from '../components/snapshot-filters.js';
import { SnapshotTimeline } from '../components/snapshot-timeline.js';
import { ApiError, getMonitoredApp, getMonitoredApps, getSnapshots, updateMonitoredApp } from '../lib/api.js';
import { formatCaptureFrequency, formatDateTime, getAppDisplayTitle } from '../lib/formatters.js';

export function MonitoredAppPage() {
  const { appId } = useParams<{ appId: string }>();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<'all' | 'success' | 'failed'>('all');
  const [changed, setChanged] = useState<'all' | 'true' | 'false'>('all');
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const editDialogTitle = 'Edit monitored app';
  const editDialogDescription = 'Update market context, cadence, or temporarily pause tracking.';
  const editDialogTitleId = useId();
  const editDialogDescriptionId = useId();
  const editDialogRef = useRef<HTMLDivElement | null>(null);
  const lastFocusedElementRef = useRef<HTMLElement | null>(null);

  const monitoredAppsQuery = useQuery({
    queryKey: ['monitored-apps'],
    queryFn: getMonitoredApps
  });
  const monitoredAppQuery = useQuery({
    queryKey: ['monitored-app', appId],
    queryFn: () => getMonitoredApp(appId!),
    enabled: Boolean(appId),
    refetchInterval: 30_000
  });
  const snapshotsQuery = useQuery({
    queryKey: ['snapshots', appId, status, changed],
    queryFn: () =>
      getSnapshots({
        monitoredAppId: appId!,
        status,
        changed
      }),
    enabled: Boolean(appId),
    refetchInterval: 30_000
  });

  const updateMutation = useMutation({
    mutationFn: (values: {
      sourceUrl: string;
      region: string;
      locale: string;
      captureFrequencyMinutes: number;
      isActive: boolean;
    }) =>
      updateMonitoredApp(appId!, {
        sourceUrl: values.sourceUrl,
        region: values.region,
        locale: values.locale,
        captureFrequencyMinutes: values.captureFrequencyMinutes,
        isActive: values.isActive
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['monitored-apps'] }),
        queryClient.invalidateQueries({ queryKey: ['monitored-app', appId] }),
        queryClient.invalidateQueries({ queryKey: ['snapshots', appId] })
      ]);
      setIsEditDialogOpen(false);
    }
  });

  useEffect(() => {
    if (!isEditDialogOpen) {
      return undefined;
    }

    lastFocusedElementRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.classList.add('modal-open');

    const focusableSelector = [
      'a[href]',
      'button:not([disabled])',
      'input:not([disabled])',
      'select:not([disabled])',
      'textarea:not([disabled])',
      '[tabindex]:not([tabindex="-1"])'
    ].join(', ');
    const dialogElement = editDialogRef.current;
    const focusableElements = dialogElement
      ? Array.from(dialogElement.querySelectorAll<HTMLElement>(focusableSelector))
      : [];
    const firstFocusableElement = focusableElements[0] ?? dialogElement;
    const lastFocusableElement = focusableElements.at(-1) ?? dialogElement;

    firstFocusableElement?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setIsEditDialogOpen(false);
        return;
      }

      if (event.key !== 'Tab' || !firstFocusableElement || !lastFocusableElement) {
        return;
      }

      if (event.shiftKey && document.activeElement === firstFocusableElement) {
        event.preventDefault();
        lastFocusableElement.focus();
        return;
      }

      if (!event.shiftKey && document.activeElement === lastFocusableElement) {
        event.preventDefault();
        firstFocusableElement.focus();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.classList.remove('modal-open');
      lastFocusedElementRef.current?.focus();
    };
  }, [isEditDialogOpen]);

  if (!appId) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="page-shell">
      <div className="grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)]" aria-hidden={isEditDialogOpen}>
        <aside className="surface-panel flex min-h-[680px] flex-col gap-4 rounded-[30px] px-6 py-6">
          <div className="space-y-2">
            <p className="section-title">Tracked apps</p>
            <p className="muted-copy">Switch quickly between competitors without leaving the monitoring flow.</p>
          </div>

          {monitoredAppsQuery.isLoading ? (
            <div className="flex flex-col gap-3">
              <div className="skeleton-block h-[92px] w-full" />
              <div className="skeleton-block h-[92px] w-full" />
            </div>
          ) : monitoredAppsQuery.isError ? (
            <p className="text-sm font-medium text-rose-600 dark:text-rose-400">
              {monitoredAppsQuery.error instanceof Error
                ? monitoredAppsQuery.error.message
                : 'Failed to load monitored apps.'}
            </p>
          ) : (
            <AppsList apps={monitoredAppsQuery.data ?? []} activeAppId={appId} />
          )}
        </aside>

        <div className="flex flex-col gap-5">
          <header className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-2">
              <RouterLink
                to="/"
                className="inline-flex text-sm font-medium text-cyan-700 underline decoration-cyan-500/30 underline-offset-4 dark:text-cyan-300"
              >
                Back to dashboard
              </RouterLink>
              <h1 className="text-4xl font-semibold tracking-[-0.05em] md:text-5xl">
                {monitoredAppQuery.data ? getAppDisplayTitle(monitoredAppQuery.data) : 'Monitoring page'}
              </h1>
            </div>

            {monitoredAppQuery.data ? (
              <button
                type="button"
                className="button-secondary"
                onClick={() => setIsEditDialogOpen(true)}
              >
                Edit settings
              </button>
            ) : null}
          </header>

          {monitoredAppQuery.isLoading ? (
            <section className="surface-panel rounded-[30px] px-6 py-6">
              <div className="flex flex-col gap-3">
                <div className="skeleton-block h-6 w-44" />
                <div className="skeleton-block h-[140px] w-full" />
              </div>
            </section>
          ) : monitoredAppQuery.isError ? (
            <section className="surface-panel rounded-[30px] px-6 py-6">
              <p className="text-sm font-medium text-rose-600 dark:text-rose-400">
                {monitoredAppQuery.error instanceof ApiError
                  ? monitoredAppQuery.error.message
                  : 'Failed to load monitored app.'}
              </p>
            </section>
          ) : monitoredAppQuery.data ? (
            <section className="surface-panel rounded-[30px] px-6 py-6">
              <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                <div className="flex flex-col gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`badge-pill ${monitoredAppQuery.data.isActive ? 'badge-success' : 'badge-neutral'}`}>
                      {monitoredAppQuery.data.isActive ? 'Active monitoring' : 'Paused'}
                    </span>
                    <span className="badge-pill badge-accent">
                      {formatCaptureFrequency(monitoredAppQuery.data.captureFrequencyMinutes)}
                    </span>
                    <span className="badge-pill badge-accent">{monitoredAppQuery.data.snapshotCount} captures</span>
                  </div>

                  <div className="space-y-1">
                    <p className="text-sm text-slate-500 dark:text-slate-400">Source URL</p>
                    <a
                      href={monitoredAppQuery.data.sourceUrl}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="break-all text-sm font-medium text-cyan-700 underline decoration-cyan-500/30 underline-offset-4 dark:text-cyan-300"
                    >
                      {monitoredAppQuery.data.sourceUrl}
                    </a>
                  </div>

                  <p className="font-mono text-xs text-slate-500 dark:text-slate-400">
                    Package: {monitoredAppQuery.data.packageId}
                  </p>
                </div>

                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  <DetailMetric label="Region" value={monitoredAppQuery.data.region} />
                  <DetailMetric label="Locale" value={monitoredAppQuery.data.locale} />
                  <DetailMetric label="Created" value={formatDateTime(monitoredAppQuery.data.createdAt)} />
                  <DetailMetric label="Last attempt" value={formatDateTime(monitoredAppQuery.data.lastAttemptAt)} />
                  <DetailMetric label="Last success" value={formatDateTime(monitoredAppQuery.data.lastSuccessAt)} />
                  <DetailMetric label="Next capture" value={formatDateTime(monitoredAppQuery.data.nextCaptureAt)} />
                </div>
              </div>
            </section>
          ) : null}

          <SnapshotFilters
            status={status}
            changed={changed}
            onStatusChange={setStatus}
            onChangedChange={setChanged}
          />

          <SnapshotTimeline
            snapshots={snapshotsQuery.data ?? []}
            isLoading={snapshotsQuery.isLoading}
            errorMessage={
              snapshotsQuery.isError
                ? snapshotsQuery.error instanceof Error
                  ? snapshotsQuery.error.message
                  : 'Failed to load snapshots.'
                : null
            }
          />
        </div>
      </div>

      {isEditDialogOpen && monitoredAppQuery.data ? (
        <div
          className="dialog-overlay"
          onClick={() => setIsEditDialogOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={editDialogTitleId}
            aria-describedby={editDialogDescriptionId}
            tabIndex={-1}
            ref={editDialogRef}
            className="dialog-content"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="surface-panel rounded-[30px] px-4 py-4 sm:px-5">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <h2 id={editDialogTitleId} className="section-title">
                    {editDialogTitle}
                  </h2>
                  <p id={editDialogDescriptionId} className="muted-copy">
                    {editDialogDescription}
                  </p>
                </div>
                <button
                  type="button"
                  className="button-soft shrink-0"
                  onClick={() => setIsEditDialogOpen(false)}
                  aria-label="Close edit settings"
                >
                  Close
                </button>
              </div>
              <MonitoredAppForm
                title={editDialogTitle}
                description={editDialogDescription}
                submitLabel="Save changes"
                submitPendingLabel="Saving..."
                helperText="Saving updates keeps history intact. Re-activating a paused app schedules capture immediately."
                showStatusField
                defaultValues={{
                  sourceUrl: monitoredAppQuery.data.sourceUrl,
                  region: monitoredAppQuery.data.region,
                  locale: monitoredAppQuery.data.locale,
                  captureFrequencyMinutes: monitoredAppQuery.data.captureFrequencyMinutes,
                  isActive: monitoredAppQuery.data.isActive
                }}
                onSubmit={async (values) => {
                  await updateMutation.mutateAsync(values);
                }}
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function DetailMetric(props: { label: string; value: string }) {
  return (
    <section className="detail-metric">
      <p className="text-sm text-slate-500 dark:text-slate-400">{props.label}</p>
      <p className="text-base font-semibold tracking-[-0.02em]">{props.value}</p>
    </section>
  );
}
