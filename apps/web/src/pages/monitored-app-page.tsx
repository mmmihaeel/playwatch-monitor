import { startTransition, useEffect, useId, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { flushSync } from 'react-dom';
import { Link as RouterLink, Navigate, useNavigate, useParams } from 'react-router-dom';

import { AppsList } from '../components/apps-list.js';
import { MonitoredAppForm } from '../components/monitored-app-form.js';
import { SnapshotFilters } from '../components/snapshot-filters.js';
import { SnapshotTimeline } from '../components/snapshot-timeline.js';
import { ApiError, deleteMonitoredApp, getMonitoredApp, getMonitoredApps, getSnapshots, updateMonitoredApp } from '../lib/api.js';
import { formatCaptureFrequency, formatDateTime, getAppDisplayTitle } from '../lib/formatters.js';

export function MonitoredAppPage() {
  const { appId } = useParams<{ appId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<'all' | 'success' | 'failed'>('all');
  const [changed, setChanged] = useState<'all' | 'true' | 'false'>('all');
  const [activeDialog, setActiveDialog] = useState<'edit' | 'delete' | null>(null);
  const [isDeletingApp, setIsDeletingApp] = useState(false);
  const editDialogTitle = 'Edit monitored app';
  const editDialogDescription = 'Update market context, cadence, or temporarily pause tracking.';
  const editDialogTitleId = useId();
  const editDialogDescriptionId = useId();
  const deleteDialogTitleId = useId();
  const deleteDialogDescriptionId = useId();
  const editDialogRef = useRef<HTMLDivElement | null>(null);
  const deleteDialogRef = useRef<HTMLDivElement | null>(null);
  const lastFocusedElementRef = useRef<HTMLElement | null>(null);

  const monitoredAppsQuery = useQuery({
    queryKey: ['monitored-apps'],
    queryFn: ({ signal }) => getMonitoredApps(signal),
    staleTime: 10_000
  });
  const monitoredAppQuery = useQuery({
    queryKey: ['monitored-app', appId],
    queryFn: ({ signal }) => getMonitoredApp(appId!, signal),
    enabled: Boolean(appId) && !isDeletingApp,
    refetchInterval: 30_000
  });
  const snapshotsQuery = useQuery({
    queryKey: ['snapshots', appId, status, changed],
    queryFn: ({ signal }) =>
      getSnapshots({
        monitoredAppId: appId!,
        status,
        changed
      }, signal),
    enabled: Boolean(appId) && !isDeletingApp,
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
      setActiveDialog(null);
    }
  });
  const deleteMutation = useMutation({
    mutationFn: () => deleteMonitoredApp(appId!),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['monitored-apps'] });
    },
    onError: async () => {
      setIsDeletingApp(false);
      await queryClient.invalidateQueries({ queryKey: ['monitored-apps'] });
    }
  });

  const handleDeleteApp = async () => {
    flushSync(() => {
      setIsDeletingApp(true);
      setActiveDialog(null);
    });

    await Promise.all([
      queryClient.cancelQueries({ queryKey: ['monitored-apps'] }),
      queryClient.cancelQueries({ queryKey: ['monitored-app', appId] }),
      queryClient.cancelQueries({ queryKey: ['snapshots', appId] })
    ]);

    queryClient.setQueryData(['monitored-apps'], (current: Awaited<ReturnType<typeof getMonitoredApps>> | undefined) =>
      current?.filter((monitoredApp) => monitoredApp.id !== appId) ?? current
    );

    startTransition(() => {
      void navigate('/');
    });

    await deleteMutation.mutateAsync();
  };

  const isDialogOpen = activeDialog !== null;
  const activeDialogRef = activeDialog === 'edit' ? editDialogRef : deleteDialogRef;

  useEffect(() => {
    if (!isDialogOpen) {
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
    const dialogElement = activeDialogRef.current;
    const focusableElements = dialogElement
      ? Array.from(dialogElement.querySelectorAll<HTMLElement>(focusableSelector))
      : [];
    const firstFocusableElement = focusableElements[0] ?? dialogElement;
    const lastFocusableElement = focusableElements.at(-1) ?? dialogElement;

    firstFocusableElement?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setActiveDialog(null);
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
  }, [activeDialog, activeDialogRef, isDialogOpen]);

  if (!appId) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="page-shell">
      <div className="grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)]" aria-hidden={isDialogOpen}>
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
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  className="button-secondary"
                  onClick={() => {
                    updateMutation.reset();
                    setActiveDialog('edit');
                  }}
                >
                  Edit settings
                </button>
                <button
                  type="button"
                  className="button-danger"
                  onClick={() => {
                    deleteMutation.reset();
                    setActiveDialog('delete');
                  }}
                >
                  Delete app
                </button>
              </div>
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

      {activeDialog === 'edit' && monitoredAppQuery.data ? (
        <div
          className="dialog-overlay"
          onClick={() => setActiveDialog(null)}
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
                  onClick={() => setActiveDialog(null)}
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

      {activeDialog === 'delete' && monitoredAppQuery.data ? (
        <div
          className="dialog-overlay"
          onClick={() => setActiveDialog(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={deleteDialogTitleId}
            aria-describedby={deleteDialogDescriptionId}
            tabIndex={-1}
            ref={deleteDialogRef}
            className="dialog-content"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="surface-panel rounded-[30px] px-5 py-5 sm:px-6">
              <div className="flex flex-col gap-5">
                <div className="space-y-3">
                  <span className="badge-pill badge-danger">Permanent action</span>
                  <div className="space-y-2">
                    <h2 id={deleteDialogTitleId} className="section-title">
                      Delete monitored app
                    </h2>
                    <p id={deleteDialogDescriptionId} className="muted-copy">
                      Remove {getAppDisplayTitle(monitoredAppQuery.data)}, all captured screenshots, and any future
                      scheduled captures for this app. Already queued capture jobs exit as soon as the app record is gone.
                    </p>
                  </div>
                </div>

                <div className="rounded-[24px] border border-rose-500/15 bg-rose-500/6 px-4 py-4 dark:border-rose-400/20 dark:bg-rose-400/8">
                  <p className="text-sm leading-6 text-slate-700 dark:text-slate-200">
                    This action is irreversible. Monitoring history and screenshot evidence for
                    <span className="font-semibold"> {monitoredAppQuery.data.packageId}</span> will be deleted.
                  </p>
                </div>

                {deleteMutation.isError ? (
                  <p role="alert" className="field-error text-sm">
                    {deleteMutation.error instanceof Error
                      ? deleteMutation.error.message
                      : 'Failed to delete the monitored app.'}
                  </p>
                ) : null}

                <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                  <button
                    type="button"
                    className="button-soft"
                    onClick={() => setActiveDialog(null)}
                    disabled={deleteMutation.isPending}
                  >
                    Keep app
                  </button>
                  <button
                    type="button"
                    className="button-danger"
                    onClick={() => {
                      void handleDeleteApp();
                    }}
                    disabled={deleteMutation.isPending}
                  >
                    {deleteMutation.isPending ? 'Deleting...' : 'Delete monitored app'}
                  </button>
                </div>
              </div>
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
