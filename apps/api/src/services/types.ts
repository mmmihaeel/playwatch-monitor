import type {
  MonitoredAppCreateInput,
  MonitoredAppDto,
  MonitoredAppUpdateInput,
  SnapshotDto,
  SnapshotQuery
} from '@playwatch/shared';

export type MonitoredAppsService = {
  list: () => Promise<MonitoredAppDto[]>;
  getById: (id: string) => Promise<MonitoredAppDto>;
  create: (input: MonitoredAppCreateInput) => Promise<MonitoredAppDto>;
  update: (id: string, input: MonitoredAppUpdateInput) => Promise<MonitoredAppDto>;
};

export type SnapshotsService = {
  listByMonitoredAppId: (monitoredAppId: string, query: SnapshotQuery) => Promise<SnapshotDto[]>;
};

export type ApiServices = {
  monitoredApps: MonitoredAppsService;
  snapshots: SnapshotsService;
};
