import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { z } from 'zod';

const defaultEnvFilePath = fileURLToPath(new URL('../../../.env', import.meta.url));

if (existsSync(defaultEnvFilePath)) {
  process.loadEnvFile(defaultEnvFilePath);
}

const booleanishSchema = z
  .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
  .transform((value) => {
    if (typeof value === 'boolean') {
      return value;
    }

    return value === 'true' || value === '1';
  });

const csvSchema = z.string().transform((value) =>
  value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
);

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().min(1),
  API_HOST: z.string().min(1).default('0.0.0.0'),
  API_PORT: z.coerce.number().int().positive().optional(),
  PORT: z.coerce.number().int().positive().optional(),
  API_TRUST_PROXY: booleanishSchema.default(false),
  WEB_PORT: z.coerce.number().int().positive().default(3000),
  WEB_ORIGIN: z.string().url().default('http://localhost:3000'),
  CORS_ORIGINS: z
    .string()
    .default('http://localhost:3000,http://127.0.0.1:3000')
    .transform((value) => csvSchema.parse(value)),
  WORKER_CONCURRENCY: z.coerce.number().int().positive().default(2),
  CAPTURE_SCHEDULER_INTERVAL_MS: z.coerce.number().int().min(1_000).default(10_000),
  SCREENSHOT_STORAGE_DRIVER: z.enum(['local', 'gcs']).default('local'),
  SCREENSHOT_STORAGE_DIR: z.string().min(1).default('./data/screenshots'),
  STORAGE_PUBLIC_PATH: z.string().min(1).default('/assets/screenshots'),
  GCS_BUCKET_NAME: z.string().trim().min(1).optional(),
  GOOGLE_PLAY_DEFAULT_REGION: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/).default('US'),
  GOOGLE_PLAY_DEFAULT_LOCALE: z.string().trim().regex(/^[a-z]{2}(?:-[A-Z]{2})?$/).default('en-US'),
  PG_BOSS_SCHEMA: z.string().trim().regex(/^[A-Za-z_][A-Za-z0-9_]*$/, 'PG_BOSS_SCHEMA must be a valid PostgreSQL identifier.').default('pgboss'),
  PLAYWRIGHT_HEADLESS: booleanishSchema.default(true),
  PLAYWRIGHT_TIMEOUT_MS: z.coerce.number().int().positive().default(60_000)
}).superRefine((value, context) => {
  if (value.SCREENSHOT_STORAGE_DRIVER === 'gcs' && !value.GCS_BUCKET_NAME) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['GCS_BUCKET_NAME'],
      message: 'GCS_BUCKET_NAME is required when SCREENSHOT_STORAGE_DRIVER is set to gcs.'
    });
  }
});

export type AppConfig = Omit<z.infer<typeof envSchema>, 'API_PORT' | 'PORT'> & {
  API_PORT: number;
};

export function readConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.parse(env);

  return {
    ...parsed,
    API_PORT: parsed.PORT ?? parsed.API_PORT ?? 4000
  };
}
