import type { SnapshotDto } from '@playwatch/shared';

import { resolveAssetUrl } from '../lib/api.js';
import { formatDateTime } from '../lib/formatters.js';

export function SnapshotTimeline(props: {
  snapshots: SnapshotDto[];
  isLoading?: boolean;
  errorMessage?: string | null;
}) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="section-title">Screenshot timeline</h2>

      {props.isLoading ? (
        <div className="surface-panel rounded-[26px] px-5 py-5">
          <div className="flex flex-col gap-3">
            <div className="skeleton-block h-5 w-40" />
            <div className="skeleton-block h-[280px] w-full" />
          </div>
        </div>
      ) : null}

      {!props.isLoading && props.errorMessage ? (
        <div className="surface-panel rounded-[26px] px-5 py-5">
          <p className="text-sm font-medium text-rose-600 dark:text-rose-400">{props.errorMessage}</p>
        </div>
      ) : null}

      {!props.isLoading && !props.errorMessage && props.snapshots.length === 0 ? (
        <div className="surface-panel rounded-[26px] px-5 py-5">
          <p className="muted-copy">
            No snapshots match the current filters yet. Leave the worker running and the timeline will start filling automatically.
          </p>
        </div>
      ) : null}

      {!props.isLoading && !props.errorMessage
        ? props.snapshots.map((snapshot) => {
            const imageUrl = resolveAssetUrl(snapshot.imageUrl);

            return (
              <article key={snapshot.id} className="surface-panel snapshot-card rounded-[28px] px-5 py-5">
                <div className="flex flex-col gap-4">
                  <header className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm text-slate-500 dark:text-slate-400">Screenshot time</p>
                      <p className="text-base font-semibold tracking-[-0.02em]">
                        {formatDateTime(snapshot.capturedAt)}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`badge-pill ${snapshot.status === 'success' ? 'badge-success' : 'badge-danger'}`}>
                        {snapshot.status === 'success' ? 'Success' : 'Failed'}
                      </span>
                      {snapshot.changedFromPrevious !== null ? (
                        <span className={`badge-pill ${snapshot.changedFromPrevious ? 'badge-warning' : 'badge-neutral'}`}>
                          {snapshot.changedFromPrevious ? 'Changed' : 'Unchanged'}
                        </span>
                      ) : null}
                    </div>
                  </header>

                  {imageUrl ? (
                    <div className="snapshot-image-shell">
                      <img
                        src={imageUrl}
                        alt={`Google Play listing captured at ${formatDateTime(snapshot.capturedAt)}`}
                        className="block w-full rounded-[16px] bg-white"
                        loading="lazy"
                      />
                    </div>
                  ) : (
                    <div className="snapshot-failure">
                      <p className="text-sm font-medium text-rose-600 dark:text-rose-400">
                        {snapshot.failureReason ?? 'Capture failed.'}
                      </p>
                    </div>
                  )}

                  {snapshot.objectKey ? (
                    <p className="break-all text-xs text-slate-500 dark:text-slate-400">
                      Stored object key:{' '}
                      <a
                        href={imageUrl ?? undefined}
                        className="font-mono text-cyan-700 underline decoration-cyan-500/30 underline-offset-4 dark:text-cyan-300"
                      >
                        {snapshot.objectKey}
                      </a>
                    </p>
                  ) : null}
                </div>
              </article>
            );
          })
        : null}
    </section>
  );
}
