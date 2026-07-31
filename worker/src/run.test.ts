import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  readState: vi.fn(),
  writeState: vi.fn(),
  login: vi.fn(),
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
vi.mock('./login', () => ({
  login: mocks.login,
  formatCookieHeader: vi.fn(),
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
    process.env.EMAIL = 'test@example.com';
    process.env.PASSWORD = 'test-password';
    process.exitCode = undefined;
  });

  it('skips the run entirely when shouldRunCheck is false', async () => {
    mocks.readState.mockResolvedValue({
      creneaux: [],
      lastChecked: '2026-01-15T08:55:00Z', // 5 min ago, off-peak threshold is 30
    });

    await run(NOW);

    expect(mocks.login).not.toHaveBeenCalled();
    expect(mocks.writeState).not.toHaveBeenCalled();
  });

  it('fetches all departements, notifies on new creneaux, and writes state', async () => {
    mocks.readState.mockResolvedValue(null);
    mocks.login.mockResolvedValue('session=abc');
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
    mocks.login.mockResolvedValue('session=abc');
    mocks.fetchDepartementCreneaux.mockImplementation(async (dep: string) =>
      dep === DEPARTEMENTS[0] ? [existing] : []
    );

    await run(NOW);

    expect(mocks.sendTelegramNotification).not.toHaveBeenCalled();
    expect(mocks.writeState).toHaveBeenCalled();
  });

  it('sets exitCode to 1 and does not write state when login fails', async () => {
    mocks.readState.mockResolvedValue(null);
    mocks.login.mockRejectedValue(new Error('boom'));

    await run(NOW);

    expect(process.exitCode).toBe(1);
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
    mocks.login.mockResolvedValue('session=abc');
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
      expect.objectContaining({ creneaux: expect.arrayContaining([previous]) })
    );
  });

  it('re-logs in once on SessionExpiredError and retries the departement', async () => {
    mocks.readState.mockResolvedValue(null);
    mocks.login.mockResolvedValueOnce('session=first').mockResolvedValueOnce('session=second');
    let firstCallForDep0 = true;
    mocks.fetchDepartementCreneaux.mockImplementation(async (dep: string) => {
      if (dep === DEPARTEMENTS[0] && firstCallForDep0) {
        firstCallForDep0 = false;
        throw new SessionExpiredError(dep);
      }
      return [];
    });

    await run(NOW);

    expect(mocks.login).toHaveBeenCalledTimes(2);
    expect(process.exitCode).toBeUndefined();
    expect(mocks.fetchDepartementCreneaux).toHaveBeenCalledTimes(DEPARTEMENTS.length + 1);
    expect(mocks.writeState).toHaveBeenCalled();
  });

  it('sets exitCode to 1 when re-login after session expiry also fails', async () => {
    mocks.readState.mockResolvedValue(null);
    mocks.login
      .mockResolvedValueOnce('session=first')
      .mockRejectedValueOnce(new Error('relogin failed'));
    mocks.fetchDepartementCreneaux.mockImplementation(async (dep: string) => {
      if (dep === DEPARTEMENTS[0]) {
        throw new SessionExpiredError(dep);
      }
      return [];
    });

    await run(NOW);

    expect(process.exitCode).toBe(1);
    expect(mocks.writeState).not.toHaveBeenCalled();
  });

  it('sets exitCode to 1 when writing state fails', async () => {
    mocks.readState.mockResolvedValue(null);
    mocks.login.mockResolvedValue('session=abc');
    mocks.fetchDepartementCreneaux.mockResolvedValue([]);
    mocks.writeState.mockRejectedValue(new Error('blob write failed'));

    await run(NOW);

    expect(process.exitCode).toBe(1);
  });

  it('sets exitCode to 1 but still writes state when Telegram notification fails', async () => {
    mocks.readState.mockResolvedValue(null);
    mocks.login.mockResolvedValue('session=abc');
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
          { departement: DEPARTEMENTS[0], centre: 'Centre Test', date: '2026-08-14', heure: '14:30' },
        ]),
      })
    );
  });
});
