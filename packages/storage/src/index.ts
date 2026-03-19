import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';

import { Storage as GoogleCloudStorage } from '@google-cloud/storage';

export type StorageObject = {
  body: Buffer;
  contentType: string;
};

export type StorageAdapterConfig = {
  SCREENSHOT_STORAGE_DRIVER: 'local' | 'gcs';
  SCREENSHOT_STORAGE_DIR: string;
  GCS_BUCKET_NAME?: string;
};

export type StorageAdapter = {
  save: (objectKey: string, buffer: Buffer, options?: { contentType?: string }) => Promise<void>;
  read: (objectKey: string) => Promise<StorageObject | null>;
  remove: (objectKey: string) => Promise<void>;
};

function normalizeObjectKey(objectKey: string) {
  const segments = objectKey
    .split('/')
    .map((segment) => segment.trim())
    .filter(Boolean);

  if (segments.length === 0 || segments.some((segment) => segment === '.' || segment === '..')) {
    throw new Error('Invalid storage object key.');
  }

  return segments.join('/');
}

function resolveSafeFilePath(rootDirectory: string, objectKey: string) {
  const safeObjectKey = normalizeObjectKey(objectKey);
  const rootPath = resolve(rootDirectory);
  const filePath = resolve(rootPath, safeObjectKey);

  if (filePath !== rootPath && !filePath.startsWith(`${rootPath}${sep}`)) {
    throw new Error('Resolved storage path is outside of the configured screenshot directory.');
  }

  return filePath;
}

function isMissingObjectError(error: unknown) {
  return typeof error === 'object'
    && error !== null
    && 'code' in error
    && (error as { code?: number | string }).code === 404;
}

export function createLocalStorageAdapter(rootDirectory: string): StorageAdapter {
  return {
    async save(objectKey, buffer) {
      const filePath = resolveSafeFilePath(rootDirectory, objectKey);
      await mkdir(dirname(filePath), { recursive: true });
      await writeFile(filePath, buffer);
    },
    async read(objectKey) {
      try {
        const filePath = resolveSafeFilePath(rootDirectory, objectKey);
        const body = await readFile(filePath);

        return {
          body,
          contentType: 'image/png'
        };
      } catch (error) {
        if (typeof error === 'object' && error !== null && 'code' in error && (error as { code?: string }).code === 'ENOENT') {
          return null;
        }

        throw error;
      }
    },
    async remove(objectKey) {
      try {
        const filePath = resolveSafeFilePath(rootDirectory, objectKey);
        await unlink(filePath);
      } catch (error) {
        if (typeof error === 'object' && error !== null && 'code' in error && (error as { code?: string }).code === 'ENOENT') {
          return;
        }

        throw error;
      }
    }
  };
}

export function createGcsStorageAdapter(bucketName: string): StorageAdapter {
  const storage = new GoogleCloudStorage();
  const bucket = storage.bucket(bucketName);

  return {
    async save(objectKey, buffer, options) {
      const safeObjectKey = normalizeObjectKey(objectKey);
      const file = bucket.file(safeObjectKey);

      await file.save(buffer, {
        resumable: false,
        contentType: options?.contentType ?? 'application/octet-stream'
      });
    },
    async read(objectKey) {
      const safeObjectKey = normalizeObjectKey(objectKey);
      const file = bucket.file(safeObjectKey);

      try {
        const [body] = await file.download();
        const [metadata] = await file.getMetadata();

        return {
          body,
          contentType: metadata.contentType || 'application/octet-stream'
        };
      } catch (error) {
        if (isMissingObjectError(error)) {
          return null;
        }

        throw error;
      }
    },
    async remove(objectKey) {
      const safeObjectKey = normalizeObjectKey(objectKey);
      const file = bucket.file(safeObjectKey);

      await file.delete({
        ignoreNotFound: true
      });
    }
  };
}

export function createStorageAdapter(config: StorageAdapterConfig) {
  if (config.SCREENSHOT_STORAGE_DRIVER === 'gcs') {
    return createGcsStorageAdapter(config.GCS_BUCKET_NAME!);
  }

  return createLocalStorageAdapter(config.SCREENSHOT_STORAGE_DIR);
}
