import { Link } from 'react-router-dom';

import type { MonitoredAppDto } from '@playwatch/shared';

import { formatCaptureFrequency, formatDateTime, getAppDisplayTitle } from '../lib/formatters.js';

export function AppsList(props: {
  apps: MonitoredAppDto[];
  activeAppId?: string;
}) {
  if (!props.apps.length) {
    return (
        <div className="surface-panel rounded-[24px] px-5 py-5">
          <p className="muted-copy">
          No monitored apps yet. Add one from the create panel to start the capture loop.
          </p>
        </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {props.apps.map((app) => (
        <Link
          key={app.id}
          to={`/apps/${app.id}`}
          className={`app-list-item ${props.activeAppId === app.id ? 'app-list-item--active' : ''}`}
        >
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold tracking-[-0.02em]">{getAppDisplayTitle(app)}</p>
              <span className={`badge-pill ${app.isActive ? 'badge-success' : 'badge-neutral'}`}>
                {app.isActive ? 'Active' : 'Paused'}
              </span>
            </div>
            <p className="font-mono text-xs text-slate-500 dark:text-slate-400">{app.packageId}</p>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              {formatCaptureFrequency(app.captureFrequencyMinutes)} - {app.snapshotCount} captures
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Last success: {formatDateTime(app.lastSuccessAt)}
            </p>
          </div>
        </Link>
      ))}
    </div>
  );
}
