import type { SnapshotDto } from '@playwatch/shared';

export function SnapshotFilters(props: {
  status: 'all' | SnapshotDto['status'];
  changed: 'all' | 'true' | 'false';
  onStatusChange: (value: 'all' | SnapshotDto['status']) => void;
  onChangedChange: (value: 'all' | 'true' | 'false') => void;
}) {
  return (
    <section className="surface-panel rounded-[24px] px-5 py-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <p className="text-sm font-medium text-slate-600 dark:text-slate-300">Timeline filters</p>

        <div className="flex flex-col gap-3 sm:flex-row">
          <select
            className="select-control min-w-[210px]"
            aria-label="Capture status filter"
            value={props.status}
            onChange={(event) => props.onStatusChange(event.target.value as 'all' | SnapshotDto['status'])}
          >
            <option value="all">All statuses</option>
            <option value="success">Successful captures</option>
            <option value="failed">Failed captures</option>
          </select>

          <select
            className="select-control min-w-[210px]"
            aria-label="Change state filter"
            value={props.changed}
            onChange={(event) => props.onChangedChange(event.target.value as 'all' | 'true' | 'false')}
          >
            <option value="all">All changes</option>
            <option value="true">Changed only</option>
            <option value="false">Unchanged only</option>
          </select>
        </div>
      </div>
    </section>
  );
}
