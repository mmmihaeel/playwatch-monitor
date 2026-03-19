import { describe, expect, it, vi } from 'vitest';

import { scheduleDueCaptures } from './schedule-captures.js';

describe('scheduleDueCaptures', () => {
  it('claims due apps and enqueues capture jobs', async () => {
    const boss = {
      send: vi.fn().mockResolvedValue('job-id')
    };
    const monitoredAppsRepository = {
      claimDue: vi.fn().mockResolvedValue([
        { id: 'app-1' },
        { id: 'app-2' }
      ])
    };

    const result = await scheduleDueCaptures({
      boss: boss as never,
      monitoredAppsRepository: monitoredAppsRepository as never,
      now: new Date('2026-03-18T10:00:00.000Z'),
      limit: 10
    });

    expect(result).toBe(2);
    expect(monitoredAppsRepository.claimDue).toHaveBeenCalledWith(
      10,
      new Date('2026-03-18T10:00:00.000Z')
    );
    expect(boss.send).toHaveBeenCalledTimes(2);
    expect(boss.send).toHaveBeenNthCalledWith(1, 'capture-listing', { monitoredAppId: 'app-1' });
    expect(boss.send).toHaveBeenNthCalledWith(2, 'capture-listing', { monitoredAppId: 'app-2' });
  });
});
