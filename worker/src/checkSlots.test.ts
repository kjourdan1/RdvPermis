import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  execFile: vi.fn(),
}));

vi.mock('node:child_process', () => ({
  execFile: mocks.execFile,
}));

import {
  parseApiResponse,
  fetchDepartementCreneaux,
  randomDelayMs,
  SessionExpiredError,
  RateLimitedError,
} from './checkSlots';

// execFile is promisified via node:util's callback-style wrapping, so the
// mock has to behave like the callback form: (file, args, opts, callback).
function mockCurlResult(status: number, body: string) {
  mocks.execFile.mockImplementationOnce((_file, _args, _opts, callback) => {
    callback(null, { stdout: `${body}\n${status}`, stderr: '' });
  });
}

function mockCurlError(error: Error) {
  mocks.execFile.mockImplementationOnce((_file, _args, _opts, callback) => {
    callback(error, { stdout: '', stderr: '' });
  });
}

describe('parseApiResponse', () => {
  it('converts each creneau to Paris local date and time', () => {
    const raw = [
      {
        centre: { nom: 'Centre de Versailles' },
        creneaux: [{ dateDebut: '2026-08-14T12:30:00.000Z' }], // 14:30 Paris (CEST)
      },
    ];
    expect(parseApiResponse('078', raw)).toEqual([
      { departement: '078', centre: 'Centre de Versailles', date: '2026-08-14', heure: '14:30' },
    ]);
  });

  it('flattens multiple creneaux across multiple centres', () => {
    const raw = [
      {
        centre: { nom: 'Centre A' },
        creneaux: [
          { dateDebut: '2026-01-14T07:00:00.000Z' }, // 08:00 Paris (CET)
          { dateDebut: '2026-01-14T08:15:00.000Z' }, // 09:15 Paris (CET)
        ],
      },
      {
        centre: { nom: 'Centre B' },
        creneaux: [{ dateDebut: '2026-01-15T09:00:00.000Z' }], // 10:00 Paris (CET)
      },
    ];
    const result = parseApiResponse('091', raw);
    expect(result).toEqual([
      { departement: '091', centre: 'Centre A', date: '2026-01-14', heure: '08:00' },
      { departement: '091', centre: 'Centre A', date: '2026-01-14', heure: '09:15' },
      { departement: '091', centre: 'Centre B', date: '2026-01-15', heure: '10:00' },
    ]);
  });

  it('throws on an unexpected response shape', () => {
    expect(() => parseApiResponse('078', { message: 'error' })).toThrow(
      'Unexpected creneaux API response shape for departement 078'
    );
  });
});

describe('fetchDepartementCreneaux', () => {
  beforeEach(() => {
    mocks.execFile.mockReset();
  });

  it('returns parsed creneaux on success', async () => {
    mockCurlResult(
      200,
      JSON.stringify([
        { centre: { nom: 'Centre A' }, creneaux: [{ dateDebut: '2026-08-14T12:30:00.000Z' }] },
      ])
    );
    const result = await fetchDepartementCreneaux('078', 'session=abc');
    expect(result).toEqual([
      { departement: '078', centre: 'Centre A', date: '2026-08-14', heure: '14:30' },
    ]);
    expect(mocks.execFile).toHaveBeenCalledTimes(1);
  });

  it('retries once after a transient failure and succeeds on the second attempt', async () => {
    mockCurlResult(500, '');
    mockCurlResult(200, '[]');
    const result = await fetchDepartementCreneaux('078', 'session=abc');
    expect(result).toEqual([]);
    expect(mocks.execFile).toHaveBeenCalledTimes(2);
  });

  it('throws after two consecutive transient failures', async () => {
    mockCurlResult(500, '');
    mockCurlResult(500, '');
    await expect(fetchDepartementCreneaux('078', 'session=abc')).rejects.toThrow(
      'Creneaux API returned 500 for departement 078'
    );
    expect(mocks.execFile).toHaveBeenCalledTimes(2);
  });

  it('throws SessionExpiredError immediately on a 401, without retrying', async () => {
    mockCurlResult(401, '');
    await expect(fetchDepartementCreneaux('078', 'session=abc')).rejects.toBeInstanceOf(
      SessionExpiredError
    );
    expect(mocks.execFile).toHaveBeenCalledTimes(1);
  });

  it('throws SessionExpiredError immediately on a 403, without retrying', async () => {
    mockCurlResult(403, '');
    await expect(fetchDepartementCreneaux('078', 'session=abc')).rejects.toBeInstanceOf(
      SessionExpiredError
    );
    expect(mocks.execFile).toHaveBeenCalledTimes(1);
  });

  it('throws RateLimitedError immediately on a 429, without retrying', async () => {
    mockCurlResult(429, '');
    await expect(fetchDepartementCreneaux('078', 'session=abc')).rejects.toBeInstanceOf(
      RateLimitedError
    );
    expect(mocks.execFile).toHaveBeenCalledTimes(1);
  });

  it('throws SessionExpiredError after a transient failure then 401, without a third attempt', async () => {
    mockCurlResult(500, '');
    mockCurlResult(401, '');
    await expect(fetchDepartementCreneaux('078', 'session=abc')).rejects.toBeInstanceOf(
      SessionExpiredError
    );
    expect(mocks.execFile).toHaveBeenCalledTimes(2);
  });

  it('propagates a curl execution failure (e.g. network down)', async () => {
    mockCurlError(new Error('curl: (6) Could not resolve host'));
    mockCurlError(new Error('curl: (6) Could not resolve host'));
    await expect(fetchDepartementCreneaux('078', 'session=abc')).rejects.toThrow(
      'Could not resolve host'
    );
    expect(mocks.execFile).toHaveBeenCalledTimes(2);
  });
});

describe('randomDelayMs', () => {
  it('returns a value within the inclusive min/max range', () => {
    for (let i = 0; i < 50; i++) {
      const delay = randomDelayMs(1000, 2000);
      expect(delay).toBeGreaterThanOrEqual(1000);
      expect(delay).toBeLessThanOrEqual(2000);
    }
  });
});
