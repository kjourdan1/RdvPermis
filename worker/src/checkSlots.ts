import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { Creneau } from './types';

const execFileAsync = promisify(execFile);

export class SessionExpiredError extends Error {
  constructor(departement: string) {
    super(`Session expired while fetching departement ${departement}`);
    this.name = 'SessionExpiredError';
  }
}

// Thrown on a 429: the site has just told us, in plain terms, to slow down.
// Retrying immediately (like the generic transient-failure path below) would
// only add to the flood; run.ts treats this as fatal for the whole run
// instead of ploughing through the remaining departements one by one.
export class RateLimitedError extends Error {
  constructor(departement: string) {
    super(`Rate limited while fetching departement ${departement}`);
    this.name = 'RateLimitedError';
  }
}

interface RawCentre {
  nom: string;
}
interface RawCreneau {
  dateDebut: string;
}
interface RawDepartementResponse {
  centre: RawCentre;
  creneaux: RawCreneau[];
}

function toParisDateAndHeure(instant: Date): { date: string; heure: string } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Paris',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant);
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    heure: `${get('hour')}:${get('minute')}`,
  };
}

export function parseApiResponse(departement: string, raw: unknown): Creneau[] {
  if (!Array.isArray(raw)) {
    throw new Error(`Unexpected creneaux API response shape for departement ${departement}`);
  }
  const result: Creneau[] = [];
  for (const row of raw as RawDepartementResponse[]) {
    for (const creneau of row.creneaux) {
      const { date, heure } = toParisDateAndHeure(new Date(creneau.dateDebut));
      result.push({ departement, centre: row.centre.nom, date, heure });
    }
  }
  return result;
}

const API_BASE = 'https://candidat.permisdeconduire.gouv.fr/api/v1/candidat/creneaux';

// A bare Node fetch is missing everything a real Chrome XHR sends alongside
// its User-Agent (the sec-ch-ua/sec-fetch-* Client Hints); claiming to be
// Chrome via UA while omitting all of them is itself an inconsistency
// Cloudflare's bot-management can key on independently of cookie validity.
// This exact header set is what worker/login-container's own DevTools-copied
// request used successfully against this same endpoint.
const API_HEADERS = {
  Accept: 'application/json, text/plain, */*',
  'User-Agent':
    'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36',
  'sec-ch-ua': '"Not;A=Brand";v="8", "Chromium";v="150"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"Linux"',
  'sec-fetch-dest': 'empty',
  'sec-fetch-mode': 'cors',
  'sec-fetch-site': 'same-origin',
};

// Shells out to curl instead of using Node's own fetch: an identical request
// (same cookie, same headers, same URL) reliably got 200 via curl but was
// rejected as a session error via Node's fetch/undici in CI. The remaining
// difference between them is below the HTTP layer (TLS/HTTP2 fingerprint),
// which was flagged as a real risk from the start of this investigation --
// curl is what's actually been proven to work against this endpoint.
async function curlGet(
  url: string,
  headers: Record<string, string>
): Promise<{ status: number; body: string }> {
  const headerArgs = Object.entries(headers).flatMap(([key, value]) => ['-H', `${key}: ${value}`]);
  const { stdout } = await execFileAsync(
    'curl',
    ['-s', '-o', '-', '-w', '\n%{http_code}', ...headerArgs, url],
    { maxBuffer: 10 * 1024 * 1024 }
  );
  const splitAt = stdout.lastIndexOf('\n');
  return {
    body: stdout.slice(0, splitAt),
    status: Number(stdout.slice(splitAt + 1).trim()),
  };
}

export async function fetchDepartementCreneaux(
  departement: string,
  cookieHeader: string
): Promise<Creneau[]> {
  const attempt = async (): Promise<Creneau[]> => {
    const { status, body } = await curlGet(`${API_BASE}?code-departement=${departement}`, {
      ...API_HEADERS,
      Cookie: cookieHeader,
    });
    if (status === 401 || status === 403) {
      throw new SessionExpiredError(departement);
    }
    if (status === 429) {
      throw new RateLimitedError(departement);
    }
    if (status < 200 || status >= 300) {
      throw new Error(`Creneaux API returned ${status} for departement ${departement}`);
    }
    return parseApiResponse(departement, JSON.parse(body));
  };

  try {
    return await attempt();
  } catch (error) {
    if (error instanceof SessionExpiredError || error instanceof RateLimitedError) {
      throw error;
    }
    return await attempt();
  }
}

export function randomDelayMs(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
