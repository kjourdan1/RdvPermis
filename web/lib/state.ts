import { list } from '@vercel/blob';

export interface Creneau {
  departement: string;
  centre: string;
  date: string;
  heure: string;
}

export interface StateFile {
  creneaux: Creneau[];
  lastChecked: string;
}

const STATE_BLOB_PATH = 'creneaux.json';

export async function getLatestState(): Promise<StateFile | null> {
  const { blobs } = await list({ prefix: STATE_BLOB_PATH });
  const existing = blobs.find((b) => b.pathname === STATE_BLOB_PATH);
  if (!existing) {
    return null;
  }
  const response = await fetch(existing.url, { next: { revalidate: 120 } } as any);
  if (!response.ok) {
    throw new Error(`Failed to fetch state blob: ${response.status}`);
  }
  return (await response.json()) as StateFile;
}
