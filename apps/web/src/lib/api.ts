import type { ZodTypeAny } from 'zod';

import {
  apiErrorSchema,
  monitoredAppCreateSchema,
  monitoredAppListResponseSchema,
  monitoredAppResponseSchema,
  monitoredAppUpdateSchema,
  snapshotListResponseSchema
} from '@playwatch/shared';
import type {
  MonitoredAppCreateInput,
  MonitoredAppDto,
  MonitoredAppUpdateInput,
  SnapshotDto
} from '@playwatch/shared';

const configuredApiBaseUrl = import.meta.env.VITE_API_BASE_URL;
const defaultApiBaseUrl = 'http://localhost:4000/api';

function trimTrailingSlash(value: string) {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

function resolveApiBaseUrl() {
  if (typeof configuredApiBaseUrl !== 'string' || configuredApiBaseUrl.length === 0) {
    return defaultApiBaseUrl;
  }

  if (/^[a-zA-Z][a-zA-Z\d+.-]*:/.test(configuredApiBaseUrl)) {
    return trimTrailingSlash(configuredApiBaseUrl);
  }

  const browserOrigin =
    typeof window !== 'undefined' && window.location.origin !== 'null'
      ? window.location.origin
      : defaultApiBaseUrl;

  return trimTrailingSlash(new URL(configuredApiBaseUrl, browserOrigin).toString());
}

const apiBaseUrl = resolveApiBaseUrl();
const apiOrigin = new URL(apiBaseUrl).origin;

export class ApiError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly code?: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<TSchema extends ZodTypeAny>(
  input: RequestInfo | URL,
  init: RequestInit,
  schema: TSchema
): Promise<TSchema['_output']> {
  const response = await fetch(input, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers ?? {})
    },
    signal: AbortSignal.timeout(15_000)
  });

  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const parsedError = apiErrorSchema.safeParse(payload);

    throw new ApiError(
      response.status,
      parsedError.success ? parsedError.data.message : 'Unexpected API error.',
      parsedError.success ? parsedError.data.error : undefined
    );
  }

  return schema.parse(payload);
}

export function resolveAssetUrl(assetPath: string | null) {
  if (!assetPath) {
    return null;
  }

  return new URL(assetPath, apiOrigin).toString();
}

export async function getMonitoredApps() {
  const response = await request(`${apiBaseUrl}/monitored-apps`, { method: 'GET' }, monitoredAppListResponseSchema);
  return response.data;
}

export async function getMonitoredApp(monitoredAppId: string) {
  const response = await request(
    `${apiBaseUrl}/monitored-apps/${monitoredAppId}`,
    { method: 'GET' },
    monitoredAppResponseSchema
  );

  return response.data;
}

export async function createMonitoredApp(input: MonitoredAppCreateInput) {
  const body = monitoredAppCreateSchema.parse(input);
  const response = await request(
    `${apiBaseUrl}/monitored-apps`,
    {
      method: 'POST',
      body: JSON.stringify(body)
    },
    monitoredAppResponseSchema
  );

  return response.data;
}

export async function updateMonitoredApp(monitoredAppId: string, input: MonitoredAppUpdateInput) {
  const body = monitoredAppUpdateSchema.parse(input);
  const response = await request(
    `${apiBaseUrl}/monitored-apps/${monitoredAppId}`,
    {
      method: 'PATCH',
      body: JSON.stringify(body)
    },
    monitoredAppResponseSchema
  );

  return response.data;
}

export async function getSnapshots(input: {
  monitoredAppId: string;
  status: 'all' | SnapshotDto['status'];
  changed: 'all' | 'true' | 'false';
}) {
  const query = new URLSearchParams();
  query.set('limit', '30');

  if (input.status !== 'all') {
    query.set('status', input.status);
  }

  if (input.changed !== 'all') {
    query.set('changed', input.changed);
  }

  const response = await request(
    `${apiBaseUrl}/monitored-apps/${input.monitoredAppId}/snapshots?${query.toString()}`,
    { method: 'GET' },
    snapshotListResponseSchema
  );

  return response.data;
}

export type DashboardSummary = {
  monitoredApps: number;
  activeApps: number;
  totalSnapshots: number;
};

export function buildDashboardSummary(monitoredApps: MonitoredAppDto[]): DashboardSummary {
  return {
    monitoredApps: monitoredApps.length,
    activeApps: monitoredApps.filter((app) => app.isActive).length,
    totalSnapshots: monitoredApps.reduce((total, app) => total + app.snapshotCount, 0)
  };
}
