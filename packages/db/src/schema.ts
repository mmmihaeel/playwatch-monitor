import {
  boolean,
  foreignKey,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid
} from 'drizzle-orm/pg-core';

export const captureStatusEnum = pgEnum('capture_status', ['success', 'failed']);

export const monitoredApps = pgTable('monitored_apps', {
  id: uuid('id').defaultRandom().primaryKey(),
  packageId: text('package_id').notNull().unique(),
  title: text('title'),
  sourceUrl: text('source_url').notNull(),
  region: text('region').notNull().default('US'),
  locale: text('locale').notNull().default('en-US'),
  captureFrequencyMinutes: integer('capture_frequency_minutes').notNull().default(60),
  nextCaptureAt: timestamp('next_capture_at', { withTimezone: true, mode: 'date' }).notNull(),
  lastAttemptAt: timestamp('last_attempt_at', { withTimezone: true, mode: 'date' }),
  lastSuccessAt: timestamp('last_success_at', { withTimezone: true, mode: 'date' }),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow()
}, (table) => [
  index('idx_monitored_apps_next_capture_at').on(table.nextCaptureAt)
]);

export const appSnapshots = pgTable('app_snapshots', {
  id: uuid('id').defaultRandom().primaryKey(),
  monitoredAppId: uuid('monitored_app_id').notNull().references(() => monitoredApps.id, { onDelete: 'cascade' }),
  objectKey: text('object_key'),
  capturedAt: timestamp('captured_at', { withTimezone: true, mode: 'date' }).notNull(),
  status: captureStatusEnum('status').notNull(),
  contentHash: text('content_hash'),
  changedFromPrevious: boolean('changed_from_previous'),
  previousSnapshotId: uuid('previous_snapshot_id'),
  failureReason: text('failure_reason'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow()
}, (table) => [
  foreignKey({
    columns: [table.previousSnapshotId],
    foreignColumns: [table.id],
    name: 'app_snapshots_previous_snapshot_id_app_snapshots_id_fk'
  }).onDelete('set null'),
  index('idx_app_snapshots_monitored_app_captured_at').on(table.monitoredAppId, table.capturedAt),
  index('idx_app_snapshots_previous_snapshot_id').on(table.previousSnapshotId)
]);

export type MonitoredAppRecord = typeof monitoredApps.$inferSelect;
export type NewMonitoredAppRecord = typeof monitoredApps.$inferInsert;
export type AppSnapshotRecord = typeof appSnapshots.$inferSelect;
export type NewAppSnapshotRecord = typeof appSnapshots.$inferInsert;
