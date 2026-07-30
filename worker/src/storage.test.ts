import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({ list: vi.fn(), put: vi.fn() }));
vi.mock('@vercel/blob', () => ({ list: mocks.list, put: mocks.put }));

import { readState, writeState } from './storage';

describe('storage', () => {
  beforeEach(() => {
    mocks.list.mockReset();
    mocks.put.mockReset();
    global.fetch = vi.fn();
  });

  it('returns null when no state blob exists yet', async () => {
    mocks.list.mockResolvedValue({ blobs: [] });
    expect(await readState()).toBeNull();
  });

  it('fetches and parses the state blob when it exists', async () => {
    mocks.list.mockResolvedValue({
      blobs: [{ pathname: 'creneaux.json', url: 'https://blob.example/creneaux.json' }],
    });
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ creneaux: [], lastChecked: '2026-01-15T07:30:00Z' }),
    });
    expect(await readState()).toEqual({ creneaux: [], lastChecked: '2026-01-15T07:30:00Z' });
  });

  it('writes the state as JSON to the fixed blob path, allowing overwrite', async () => {
    mocks.put.mockResolvedValue({});
    const state = { creneaux: [], lastChecked: '2026-01-15T07:30:00Z' };
    await writeState(state);
    expect(mocks.put).toHaveBeenCalledWith(
      'creneaux.json',
      JSON.stringify(state),
      expect.objectContaining({ allowOverwrite: true })
    );
  });
});
