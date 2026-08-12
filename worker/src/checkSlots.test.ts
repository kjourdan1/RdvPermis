import { describe, it, expect, vi, beforeEach } from 'vitest';
import { writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

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
  interpretApiResult,
  loadPreFetchedCreneaux,
} from './checkSlots';

// execFile is promisified via node:util's callback-style wrapping, so the
// mock has to behave like the callback form: (file, args, opts, callback).
// Mirrors curl -i's output shape: status line + headers, a blank line, the
// body, then curl's own -w-appended status code on its own line.
function mockCurlResult(status: number, body: string, headers: Record<string, string> = {}) {
  const headerBlock = [
    `HTTP/2 ${status}`,
    ...Object.entries(headers).map(([key, value]) => `${key}: ${value}`),
  ].join('\r\n');
  mocks.execFile.mockImplementationOnce((_file, _args, _opts, callback) => {
    callback(null, { stdout: `${headerBlock}\r\n\r\n${body}\n${status}`, stderr: '' });
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

  it('includes the status code and a body snippet in the SessionExpiredError message', async () => {
    mockCurlResult(403, '{"message":"Forbidden by WAF rule"}');
    await expect(fetchDepartementCreneaux('078', 'session=abc')).rejects.toThrow(
      /HTTP 403.*Forbidden by WAF rule/s
    );
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

  it('includes the Retry-After header and a body snippet in the RateLimitedError message', async () => {
    mockCurlResult(429, '{"message":"Nombre maximum de requetes atteint"}', { 'retry-after': '120' });
    await expect(fetchDepartementCreneaux('078', 'session=abc')).rejects.toThrow(
      /Retry-After: 120.*Nombre maximum de requetes atteint/s
    );
  });

  it('notes the absence of a Retry-After header when the 429 response omits one', async () => {
    mockCurlResult(429, '');
    await expect(fetchDepartementCreneaux('078', 'session=abc')).rejects.toThrow(
      /no Retry-After header/
    );
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

describe('interpretApiResult', () => {
  it('throws SessionExpiredError with status and body on a 401', () => {
    expect(() => interpretApiResult('078', { status: 401, body: 'nope' })).toThrow(
      /HTTP 401.*nope/s
    );
  });

  it('throws RateLimitedError with Retry-After on a 429', () => {
    expect(() =>
      interpretApiResult('078', {
        status: 429,
        body: 'slow down',
        responseHeaders: { 'retry-after': '60' },
      })
    ).toThrow(/Retry-After: 60.*slow down/s);
  });

  it('throws a generic error on an unexpected non-2xx status', () => {
    expect(() => interpretApiResult('078', { status: 500, body: '' })).toThrow(
      'Creneaux API returned 500 for departement 078'
    );
  });

  it('throws on status 0 (network error / exception before a response)', () => {
    expect(() => interpretApiResult('078', { status: 0, body: 'TypeError: fetch failed' })).toThrow(
      /No response for departement 078/
    );
  });

  it('parses a successful 2xx response the same way parseApiResponse does', () => {
    const body = JSON.stringify([{ centre: { nom: 'Test' }, creneaux: [{ dateDebut: '2026-09-01T10:00:00Z' }] }]);
    const result = interpretApiResult('078', { status: 200, body });
    expect(result).toEqual([{ departement: '078', centre: 'Test', date: '2026-09-01', heure: '12:00' }]);
  });
});

describe('loadPreFetchedCreneaux', () => {
  it('returns an empty map when the file does not exist', () => {
    const map = loadPreFetchedCreneaux('/nonexistent/path/creneaux.json');
    expect(map.size).toBe(0);
  });

  it('returns an empty map when the file contains malformed JSON', () => {
    const path = join(tmpdir(), `creneaux-malformed-${Date.now()}.json`);
    writeFileSync(path, 'not valid json {{{');
    try {
      const map = loadPreFetchedCreneaux(path);
      expect(map.size).toBe(0);
    } finally {
      unlinkSync(path);
    }
  });

  it('loads well-formed data keyed by departement', () => {
    const path = join(tmpdir(), `creneaux-valid-${Date.now()}.json`);
    writeFileSync(
      path,
      JSON.stringify([
        { departement: '027', status: 200, body: '[]' },
        { departement: '028', status: 401, body: 'unauthorized' },
      ])
    );
    try {
      const map = loadPreFetchedCreneaux(path);
      expect(map.size).toBe(2);
      expect(map.get('027')).toEqual({ status: 200, body: '[]' });
      expect(map.get('028')).toEqual({ status: 401, body: 'unauthorized' });
    } finally {
      unlinkSync(path);
    }
  });
});

describe('fetchDepartementCreneaux with pre-fetched data', () => {
  beforeEach(() => {
    mocks.execFile.mockReset();
  });

  it('uses the pre-fetched result and does not call curl when present', async () => {
    const preFetched = new Map([['078', { status: 200, body: '[]' }]]);
    const result = await fetchDepartementCreneaux('078', 'session=abc', preFetched);
    expect(result).toEqual([]);
    expect(mocks.execFile).not.toHaveBeenCalled();
  });

  it('falls back to curl when the departement is missing from the pre-fetched map', async () => {
    mockCurlResult(200, '[]');
    const preFetched = new Map([['999', { status: 200, body: '[]' }]]);
    const result = await fetchDepartementCreneaux('078', 'session=abc', preFetched);
    expect(result).toEqual([]);
    expect(mocks.execFile).toHaveBeenCalledTimes(1);
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
