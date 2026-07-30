import { put, list } from '@vercel/blob';
import type { StateFile } from './types';

const STATE_BLOB_PATH = 'creneaux.json';

export async function readState(): Promise<StateFile | null> {
  const { blobs } = await list({ prefix: STATE_BLOB_PATH });
  const existing = blobs.find((b) => b.pathname === STATE_BLOB_PATH);
  if (!existing) {
    return null;
  }
  const response = await fetch(existing.url);
  if (!response.ok) {
    throw new Error(`Failed to fetch state blob: ${response.status}`);
  }
  return (await response.json()) as StateFile;
}

export async function writeState(state: StateFile): Promise<void> {
  await put(STATE_BLOB_PATH, JSON.stringify(state), {
    access: 'public',
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: 'application/json',
  });
}
