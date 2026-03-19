import { z } from 'zod';

const PLAY_STORE_HOST = 'play.google.com';
const PLAY_STORE_PATH = '/store/apps/details';
const ANDROID_PACKAGE_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)+$/;
const REGION_PATTERN = /^[A-Z]{2}$/;
const LOCALE_PATTERN = /^[a-z]{2}(?:-[A-Z]{2})?$/;

export const captureStatusSchema = z.enum(['success', 'failed']);
export type CaptureStatus = z.infer<typeof captureStatusSchema>;

export const androidPackageNameSchema = z
  .string()
  .trim()
  .regex(ANDROID_PACKAGE_NAME_PATTERN, 'Invalid Android package name.');

export const regionSchema = z.string().trim().toUpperCase().regex(REGION_PATTERN, 'Region must use ISO-3166 alpha-2 format.');
export const localeSchema = z
  .string()
  .trim()
  .regex(LOCALE_PATTERN, 'Locale must use language-country format, for example en-US.');

export function normalizeGooglePlayUrl(rawUrl: string) {
  const url = new URL(rawUrl.trim());

  if (url.hostname !== PLAY_STORE_HOST || url.pathname !== PLAY_STORE_PATH) {
    throw new Error('Only Google Play listing URLs are supported.');
  }

  const packageId = url.searchParams.get('id');

  if (!packageId) {
    throw new Error('Missing Google Play package id.');
  }

  const parsedPackageId = androidPackageNameSchema.parse(packageId);

  return {
    packageId: parsedPackageId,
    normalizedUrl: `${url.origin}${PLAY_STORE_PATH}?id=${parsedPackageId}`
  };
}

export function buildGooglePlayListingUrl(input: {
  packageId: string;
  region: string;
  locale: string;
}) {
  const packageId = androidPackageNameSchema.parse(input.packageId);
  const region = regionSchema.parse(input.region);
  const locale = localeSchema.parse(input.locale);
  const url = new URL(`https://${PLAY_STORE_HOST}${PLAY_STORE_PATH}`);
  url.searchParams.set('id', packageId);
  url.searchParams.set('gl', region);
  url.searchParams.set('hl', locale.replace('-', '_'));
  return url.toString();
}

const isoDateTimeSchema = z.string().datetime({ offset: true });
const optionalBooleanFilterSchema = z
  .union([z.boolean(), z.enum(['true', 'false'])])
  .transform((value) => (typeof value === 'boolean' ? value : value === 'true'));

export const monitoredAppCreateSchema = z.object({
  sourceUrl: z.string().trim().url(),
  region: regionSchema.default('US'),
  locale: localeSchema.default('en-US'),
  captureFrequencyMinutes: z.coerce.number().int().min(5).max(1440).default(60)
});

export const monitoredAppUpdateSchema = z
  .object({
    sourceUrl: z.string().trim().url().optional(),
    region: regionSchema.optional(),
    locale: localeSchema.optional(),
    captureFrequencyMinutes: z.coerce.number().int().min(5).max(1440).optional(),
    isActive: z.boolean().optional()
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be provided.'
  });

export const snapshotQuerySchema = z
  .object({
    status: captureStatusSchema.optional(),
    changed: optionalBooleanFilterSchema.optional(),
    from: isoDateTimeSchema.optional(),
    to: isoDateTimeSchema.optional(),
    limit: z.coerce.number().int().min(1).max(100).default(30)
  })
  .refine((value) => {
    if (!value.from || !value.to) {
      return true;
    }

    return new Date(value.from).getTime() <= new Date(value.to).getTime();
  }, {
    message: '`from` must be earlier than or equal to `to`.',
    path: ['from']
  });

export type MonitoredAppCreateInput = z.infer<typeof monitoredAppCreateSchema>;
export type MonitoredAppUpdateInput = z.infer<typeof monitoredAppUpdateSchema>;
export type SnapshotQuery = z.infer<typeof snapshotQuerySchema>;

export const monitoredAppSchema = z.object({
  id: z.string().uuid(),
  packageId: androidPackageNameSchema,
  title: z.string().nullable(),
  sourceUrl: z.string().url(),
  region: regionSchema,
  locale: localeSchema,
  captureFrequencyMinutes: z.number().int().positive(),
  nextCaptureAt: isoDateTimeSchema,
  lastAttemptAt: isoDateTimeSchema.nullable(),
  lastSuccessAt: isoDateTimeSchema.nullable(),
  isActive: z.boolean(),
  snapshotCount: z.number().int().nonnegative(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema
});

export const snapshotSchema = z.object({
  id: z.string().uuid(),
  monitoredAppId: z.string().uuid(),
  objectKey: z.string().nullable(),
  imageUrl: z.string().nullable(),
  capturedAt: isoDateTimeSchema,
  status: captureStatusSchema,
  contentHash: z.string().nullable(),
  changedFromPrevious: z.boolean().nullable(),
  previousSnapshotId: z.string().uuid().nullable(),
  failureReason: z.string().nullable()
});

export type MonitoredAppDto = z.infer<typeof monitoredAppSchema>;
export type SnapshotDto = z.infer<typeof snapshotSchema>;

export const dataEnvelopeSchema = <T extends z.ZodTypeAny>(schema: T) =>
  z.object({
    data: schema
  });

export const monitoredAppListResponseSchema = dataEnvelopeSchema(z.array(monitoredAppSchema));
export const monitoredAppResponseSchema = dataEnvelopeSchema(monitoredAppSchema);
export const snapshotListResponseSchema = dataEnvelopeSchema(z.array(snapshotSchema));

export const apiErrorSchema = z.object({
  error: z.string(),
  message: z.string()
});

export function buildScreenshotObjectKey(packageId: string, capturedAt: Date) {
  const safePackageId = androidPackageNameSchema.parse(packageId);
  const safeTimestamp = capturedAt.toISOString().replace(/[:.]/g, '-');
  return `${safePackageId}/${safeTimestamp}.png`;
}
