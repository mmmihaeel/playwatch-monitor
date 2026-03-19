import { and, count, desc, eq, getTableColumns, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';

import type { MonitoredAppUpdateInput, SnapshotQuery } from '@playwatch/shared';

import type { DatabaseHandle } from './client.js';
import { appSnapshots, monitoredApps, type AppSnapshotRecord, type MonitoredAppRecord } from './schema.js';

const monitoredAppColumns = getTableColumns(monitoredApps);

function buildSnapshotCountJoin(database: DatabaseHandle) {
  return database.db
    .select({
      monitoredAppId: appSnapshots.monitoredAppId,
      snapshotCount: sql<number>`count(*) filter (where ${appSnapshots.status} = 'success')::int`.as('snapshot_count')
    })
    .from(appSnapshots)
    .groupBy(appSnapshots.monitoredAppId)
    .as('snapshot_counts');
}

export function createMonitoredAppsRepository(database: DatabaseHandle) {
  const snapshotCounts = buildSnapshotCountJoin(database);

  return {
    async list() {
      return database.db
        .select({
          ...monitoredAppColumns,
          snapshotCount: sql<number>`coalesce(${snapshotCounts.snapshotCount}, 0)::int`
        })
        .from(monitoredApps)
        .leftJoin(snapshotCounts, eq(snapshotCounts.monitoredAppId, monitoredApps.id))
        .orderBy(desc(monitoredApps.createdAt));
    },
    async getById(id: string) {
      const rows = await database.db
        .select({
          ...monitoredAppColumns,
          snapshotCount: sql<number>`coalesce(${snapshotCounts.snapshotCount}, 0)::int`
        })
        .from(monitoredApps)
        .leftJoin(snapshotCounts, eq(snapshotCounts.monitoredAppId, monitoredApps.id))
        .where(eq(monitoredApps.id, id))
        .limit(1);

      return rows[0] ?? null;
    },
    async getByPackageId(packageId: string) {
      const rows = await database.db
        .select()
        .from(monitoredApps)
        .where(eq(monitoredApps.packageId, packageId))
        .limit(1);

      return rows[0] ?? null;
    },
    async create(input: {
      packageId: string;
      sourceUrl: string;
      region: string;
      locale: string;
      captureFrequencyMinutes: number;
      captureImmediately: boolean;
    }) {
      const now = new Date();
      const nextCaptureAt = input.captureImmediately
        ? now
        : new Date(now.getTime() + input.captureFrequencyMinutes * 60_000);

      const rows = await database.db
        .insert(monitoredApps)
        .values({
          packageId: input.packageId,
          sourceUrl: input.sourceUrl,
          region: input.region,
          locale: input.locale,
          captureFrequencyMinutes: input.captureFrequencyMinutes,
          nextCaptureAt,
          updatedAt: now
        })
        .onConflictDoNothing({
          target: monitoredApps.packageId
        })
        .returning();

      return rows[0] ?? null;
    },
    async update(id: string, input: MonitoredAppUpdateInput & {
      packageId?: string;
      sourceUrl?: string;
      nextCaptureAt?: Date;
    }) {
      const rows = await database.db
        .update(monitoredApps)
        .set({
          packageId: input.packageId,
          sourceUrl: input.sourceUrl,
          region: input.region,
          locale: input.locale,
          captureFrequencyMinutes: input.captureFrequencyMinutes,
          nextCaptureAt: input.nextCaptureAt,
          isActive: input.isActive,
          updatedAt: new Date()
        })
        .where(eq(monitoredApps.id, id))
        .returning();

      return rows[0] ?? null;
    },
    async claimDue(limit: number, now: Date) {
      const client = await database.pool.connect();

      try {
        await client.query('begin');

        const result = await client.query<MonitoredAppRecord>(`
          with due as (
            select id
            from monitored_apps
            where is_active = true
              and next_capture_at <= $1
            order by next_capture_at asc
            for update skip locked
            limit $2
          )
          update monitored_apps as monitored_app
          set next_capture_at = $1 + (monitored_app.capture_frequency_minutes * interval '1 minute'),
              updated_at = $1
          from due
          where monitored_app.id = due.id
          returning
            monitored_app.id,
            monitored_app.package_id as "packageId",
            monitored_app.title,
            monitored_app.source_url as "sourceUrl",
            monitored_app.region,
            monitored_app.locale,
            monitored_app.capture_frequency_minutes as "captureFrequencyMinutes",
            monitored_app.next_capture_at as "nextCaptureAt",
            monitored_app.last_attempt_at as "lastAttemptAt",
            monitored_app.last_success_at as "lastSuccessAt",
            monitored_app.is_active as "isActive",
            monitored_app.created_at as "createdAt",
            monitored_app.updated_at as "updatedAt"
        `, [now, limit]);

        await client.query('commit');
        return result.rows;
      } catch (error) {
        await client.query('rollback');
        throw error;
      } finally {
        client.release();
      }
    }
  };
}

export function createSnapshotsRepository(database: DatabaseHandle) {
  return {
    async listByMonitoredAppId(monitoredAppId: string, query: SnapshotQuery) {
      const filters: SQL[] = [eq(appSnapshots.monitoredAppId, monitoredAppId)];

      if (query.status) {
        filters.push(eq(appSnapshots.status, query.status));
      }

      if (query.changed !== undefined) {
        filters.push(eq(appSnapshots.changedFromPrevious, query.changed));
      }

      if (query.from) {
        filters.push(sql`${appSnapshots.capturedAt} >= ${new Date(query.from)}`);
      }

      if (query.to) {
        filters.push(sql`${appSnapshots.capturedAt} <= ${new Date(query.to)}`);
      }

      return database.db
        .select()
        .from(appSnapshots)
        .where(and(...filters))
        .orderBy(desc(appSnapshots.capturedAt))
        .limit(query.limit);
    },
    async getLatestByMonitoredAppId(monitoredAppId: string) {
      const rows = await database.db
        .select()
        .from(appSnapshots)
        .where(eq(appSnapshots.monitoredAppId, monitoredAppId))
        .orderBy(desc(appSnapshots.capturedAt))
        .limit(1);

      return rows[0] ?? null;
    },
    async recordSuccess(input: {
      monitoredAppId: string;
      title: string;
      objectKey: string;
      capturedAt: Date;
      contentHash: string;
    }) {
      return database.db.transaction(async (tx) => {
        const previousRows = await tx
          .select()
          .from(appSnapshots)
          .where(eq(appSnapshots.monitoredAppId, input.monitoredAppId))
          .orderBy(desc(appSnapshots.capturedAt))
          .limit(1);

        const previousSnapshot = previousRows[0] ?? null;
        const snapshotRows = await tx
          .insert(appSnapshots)
          .values({
            monitoredAppId: input.monitoredAppId,
            objectKey: input.objectKey,
            capturedAt: input.capturedAt,
            status: 'success',
            contentHash: input.contentHash,
            changedFromPrevious: previousSnapshot ? previousSnapshot.contentHash !== input.contentHash : true,
            previousSnapshotId: previousSnapshot?.id ?? null
          })
          .returning();

        await tx
          .update(monitoredApps)
          .set({
            title: input.title,
            lastAttemptAt: input.capturedAt,
            lastSuccessAt: input.capturedAt,
            updatedAt: input.capturedAt
          })
          .where(eq(monitoredApps.id, input.monitoredAppId));

        return snapshotRows[0]!;
      });
    },
    async recordFailure(input: {
      monitoredAppId: string;
      capturedAt: Date;
      failureReason: string;
    }) {
      return database.db.transaction(async (tx) => {
        const snapshotRows = await tx
          .insert(appSnapshots)
          .values({
            monitoredAppId: input.monitoredAppId,
            capturedAt: input.capturedAt,
            status: 'failed',
            failureReason: input.failureReason
          })
          .returning();

        await tx
          .update(monitoredApps)
          .set({
            lastAttemptAt: input.capturedAt,
            updatedAt: input.capturedAt
          })
          .where(eq(monitoredApps.id, input.monitoredAppId));

        return snapshotRows[0]!;
      });
    },
    async countForMonitoredApp(monitoredAppId: string) {
      const rows = await database.db
        .select({ value: count(appSnapshots.id) })
        .from(appSnapshots)
        .where(and(
          eq(appSnapshots.monitoredAppId, monitoredAppId),
          eq(appSnapshots.status, 'success')
        ));

      return Number(rows[0]?.value ?? 0);
    }
  };
}

export type MonitoredAppsRepository = ReturnType<typeof createMonitoredAppsRepository>;
export type SnapshotsRepository = ReturnType<typeof createSnapshotsRepository>;
export type MonitoredAppListItem = MonitoredAppRecord & {
  snapshotCount: number;
};

export type SnapshotRecord = AppSnapshotRecord;
