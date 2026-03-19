import type { PgBoss } from 'pg-boss';

import type { MonitoredAppsRepository } from '@playwatch/db';

export async function scheduleDueCaptures(input: {
  boss: PgBoss;
  monitoredAppsRepository: MonitoredAppsRepository;
  now?: Date;
  limit?: number;
}) {
  const now = input.now ?? new Date();
  const dueApps = await input.monitoredAppsRepository.claimDue(
    input.limit ?? 25,
    now
  );
  let enqueuedCount = 0;

  for (const monitoredApp of dueApps) {
    try {
      await input.boss.send('capture-listing', {
        monitoredAppId: monitoredApp.id
      });
      enqueuedCount += 1;
    } catch (error) {
      await input.monitoredAppsRepository.update(monitoredApp.id, {
        nextCaptureAt: now
      });
      console.error('Failed to enqueue capture job.', {
        monitoredAppId: monitoredApp.id,
        error
      });
    }
  }

  return enqueuedCount;
}
