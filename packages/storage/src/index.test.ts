import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { afterEach, describe, expect, it } from 'vitest';

import { createLocalStorageAdapter } from './index.js';

const createdDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(createdDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('createLocalStorageAdapter', () => {
  it('writes and reads screenshot payloads', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'playwatch-storage-'));
    createdDirectories.push(directory);
    const storage = createLocalStorageAdapter(directory);

    await storage.save('com.example.app/2026-03-19T07-00-00-000Z.png', Buffer.from('image-data'));
    const result = await storage.read('com.example.app/2026-03-19T07-00-00-000Z.png');

    expect(result).toEqual({
      body: Buffer.from('image-data'),
      contentType: 'image/png'
    });
  });

  it('returns null for missing objects', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'playwatch-storage-'));
    createdDirectories.push(directory);
    const storage = createLocalStorageAdapter(directory);

    await expect(storage.read('com.example.app/missing.png')).resolves.toBeNull();
  });

  it('rejects traversal attempts', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'playwatch-storage-'));
    createdDirectories.push(directory);
    const storage = createLocalStorageAdapter(directory);

    await expect(storage.save('../escape.png', Buffer.from('image-data'))).rejects.toThrow('Invalid storage object key.');
  });
});
