// web/lib/state.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({ list: vi.fn() }));
vi.mock('@vercel/blob', () => ({ list: mocks.list }));

import { getLatestState } from './state';

describe('getLatestState', () => {
  beforeEach(() => {
    mocks.list.mockReset();
    global.fetch = vi.fn();
  });

  it('returns null when no state blob exists', async () => {
    mocks.list.mockResolvedValue({ blobs: [] });
    expect(await getLatestState()).toBeNull();
  });

  it('fetches and returns the parsed state when the blob exists', async () => {
    mocks.list.mockResolvedValue({
      blobs: [{ pathname: 'creneaux.json', url: 'https://blob.example/creneaux.json' }],
    });
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ creneaux: [], lastChecked: '2026-01-15T09:00:00Z' }),
    });
    expect(await getLatestState()).toEqual({ creneaux: [], lastChecked: '2026-01-15T09:00:00Z' });
  });
});
