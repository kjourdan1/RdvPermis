import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  readState: vi.fn(),
  writeState: vi.fn(),
  fetchDepartementCreneaux: vi.fn(),
  sendTelegramNotification: vi.fn(),
}));

vi.mock('./config', async () => {
  const actual = await vi.importActual<typeof import('./config')>('./config');
  return { ...actual, MIN_DELAY_MS: 0, MAX_DELAY_MS: 0 };
});
vi.mock('./storage', () => ({
  readState: mocks.readState,
  writeState: mocks.writeState,
}));
vi.mock('./checkSlots', async () => {
  const actual = await vi.importActual<typeof import('./checkSlots')>('./checkSlots');
  return { ...actual, fetchDepartementCreneaux: mocks.fetchDepartementCreneaux };
});
vi.mock('./notify', () => ({
  formatNewCreneauxMessage: (creneaux: unknown) => `formatted:${JSON.stringify(creneaux)}`,
  sendTelegramNotification: mocks.sendTelegramNotification,
}));

import { run } from './run';
import { SessionExpiredError } from './checkSlots';
import { DEPARTEMENTS } from './config';

const NOW = new Date('2026-01-15T09:00:00Z'); // 10:00 Paris, off-peak

describe('run', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.COOKIE_HEADER = 'session=abc';
    process.exitCode = undefined;
  });

  it('skips the run entirely when shouldRunCheck is false', async () => {
    mocks.readState.mockResolvedValue({
      creneaux: [],
      lastChecked: '2026-01-15T08:55:00Z', // 5 min ago, off-peak threshold is 30
    });

    await run(NOW);

    expect(mocks.fetchDepartementCreneaux).not.toHaveBeenCalled();
    expect(mocks.writeState).not.toHaveBeenCalled();
  });

  it('fetches all departements, notifies on new creneaux, and writes state', async () => {
    mocks.readState.mockResolvedValue(null);
    mocks.fetchDepartementCreneaux.mockImplementation(async (dep: string) => [
      { departement: dep, centre: 'Centre Test', date: '2026-08-14', heure: '14:30' },
    ]);

    await run(NOW);

    expect(mocks.fetchDepartementCreneaux).toHaveBeenCalledTimes(DEPARTEMENTS.length);
    expect(mocks.sendTelegramNotification).toHaveBeenCalledTimes(1);
    expect(mocks.writeState).toHaveBeenCalledWith(
      expect.objectContaining({ lastChecked: NOW.toISOString() })
    );
    expect(process.exitCode).toBeUndefined();
  });

  it('does not notify when no new creneaux appear', async () => {
    const existing = {
      departement: DEPARTEMENTS[0],
      centre: 'Centre Test',
      date: '2026-08-14',
      heure: '14:30',
    };
    mocks.readState.mockResolvedValue({ creneaux: [existing], lastChecked: null });
    mocks.fetchDepartementCreneaux.mockImplementation(async (dep: string) =>
      dep === DEPARTEMENTS[0] ? [existing] : []
    );

    await run(NOW);

    expect(mocks.sendTelegramNotification).not.toHaveBeenCalled();
    expect(mocks.writeState).toHaveBeenCalled();
  });

  it('sets exitCode to 1 and does not write state when COOKIE_HEADER is not set', async () => {
    delete process.env.COOKIE_HEADER;
    mocks.readState.mockResolvedValue(null);

    await run(NOW);

    expect(process.exitCode).toBe(1);
    expect(mocks.fetchDepartementCreneaux).not.toHaveBeenCalled();
    expect(mocks.writeState).not.toHaveBeenCalled();
  });

  it('keeps previous data for a departement whose fetch fails, and still succeeds', async () => {
    const previous = {
      departement: DEPARTEMENTS[0],
      centre: 'Old Centre',
      date: '2026-08-14',
      heure: '14:30',
    };
    mocks.readState.mockResolvedValue({ creneaux: [previous], lastChecked: null });
    mocks.fetchDepartementCreneaux.mockImplementation(async (dep: string) => {
      if (dep === DEPARTEMENTS[0]) {
        throw new Error('network error');
      }
      return [];
    });

    await run(NOW);

    expect(process.exitCode).toBeUndefined();
    expect(mocks.fetchDepartementCreneaux).toHaveBeenCalledTimes(DEPARTEMENTS.length);
    expect(mocks.writeState).toHaveBeenCalledWith(
      expect.objectContaining({
        creneaux: expect.arrayContaining([{ ...previous, isNew: false }]),
      })
    );
  });

  it('stops immediately and sets exitCode to 1 on SessionExpiredError, without writing state', async () => {
    // The login-container step already verified this exact cookie against
    // this exact API right before handing off, so there is no in-process
    // re-login to fall back to here -- see worker/login-container.
    mocks.readState.mockResolvedValue(null);
    mocks.fetchDepartementCreneaux.mockImplementation(async (dep: string) => {
      if (dep === DEPARTEMENTS[0]) {
        throw new SessionExpiredError(dep);
      }
      return [];
    });

    await run(NOW);

    expect(process.exitCode).toBe(1);
    expect(mocks.fetchDepartementCreneaux).toHaveBeenCalledTimes(1);
    expect(mocks.writeState).not.toHaveBeenCalled();
  });

  it('sets exitCode to 1 when writing state fails', async () => {
    mocks.readState.mockResolvedValue(null);
    mocks.fetchDepartementCreneaux.mockResolvedValue([]);
    mocks.writeState.mockRejectedValue(new Error('blob write failed'));

    await run(NOW);

    expect(process.exitCode).toBe(1);
  });

  it('sets exitCode to 1 but still writes state when Telegram notification fails', async () => {
    mocks.readState.mockResolvedValue(null);
    mocks.fetchDepartementCreneaux.mockImplementation(async (dep: string) =>
      dep === DEPARTEMENTS[0]
        ? [{ departement: dep, centre: 'Centre Test', date: '2026-08-14', heure: '14:30' }]
        : []
    );
    mocks.sendTelegramNotification.mockRejectedValue(new Error('telegram down'));

    await run(NOW);

    expect(process.exitCode).toBe(1);
    expect(mocks.writeState).toHaveBeenCalledWith(
      expect.objectContaining({
        creneaux: expect.arrayContaining([
          {
            departement: DEPARTEMENTS[0],
            centre: 'Centre Test',
            date: '2026-08-14',
            heure: '14:30',
            isNew: true,
          },
        ]),
      })
    );
  });

  it('marks each written creneau as new or not, matching the Telegram diff', async () => {
    const existing = {
      departement: DEPARTEMENTS[0],
      centre: 'Existing Centre',
      date: '2026-08-14',
      heure: '14:30',
      isNew: true, // stale from a previous run -- must not leak through unchanged
    };
    mocks.readState.mockResolvedValue({ creneaux: [existing], lastChecked: null });
    mocks.fetchDepartementCreneaux.mockImplementation(async (dep: string) =>
      dep === DEPARTEMENTS[0]
        ? [
            { departement: dep, centre: 'Existing Centre', date: '2026-08-14', heure: '14:30' },
            { departement: dep, centre: 'Brand New Centre', date: '2026-08-15', heure: '09:00' },
          ]
        : []
    );

    await run(NOW);

    expect(mocks.writeState).toHaveBeenCalledWith(
      expect.objectContaining({
        creneaux: expect.arrayContaining([
          {
            departement: DEPARTEMENTS[0],
            centre: 'Existing Centre',
            date: '2026-08-14',
            heure: '14:30',
            isNew: false,
          },
          {
            departement: DEPARTEMENTS[0],
            centre: 'Brand New Centre',
            date: '2026-08-15',
            heure: '09:00',
            isNew: true,
          },
        ]),
      })
    );
  });

  it('recomputes isNew for a fallback-copied creneau instead of keeping its stale value', async () => {
    const stale = {
      departement: DEPARTEMENTS[0],
      centre: 'Old Centre',
      date: '2026-08-14',
      heure: '14:30',
      isNew: true, // stored as new last run -- this run it's neither new nor absent, so must become false
    };
    mocks.readState.mockResolvedValue({ creneaux: [stale], lastChecked: null });
    mocks.fetchDepartementCreneaux.mockImplementation(async (dep: string) => {
      if (dep === DEPARTEMENTS[0]) {
        throw new Error('network error'); // forces the previousCreneaux fallback path
      }
      return [];
    });

    await run(NOW);

    expect(mocks.writeState).toHaveBeenCalledWith(
      expect.objectContaining({
        creneaux: expect.arrayContaining([{ ...stale, isNew: false }]),
      })
    );
  });
});
