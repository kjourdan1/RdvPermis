import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { Creneau } from './types';

const execFileAsync = promisify(execFile);

// Covers both 401 and 403 - status and bodySnippet are optional so existing
// callers that just need a SessionExpiredError instance (e.g. tests) don't
// need to supply them, but the real throw site in fetchDepartementCreneaux
// passes both: a bare "session expired" message can't distinguish a stale
// cookie (401) from an active block (403), which was invisible in the CI
// log until this was added.
export class SessionExpiredError extends Error {
  constructor(departement: string, status?: number, bodySnippet?: string) {
    const statusInfo = status !== undefined ? ` (HTTP ${status})` : '';
    const bodyInfo = bodySnippet ? ` -- body: ${bodySnippet}` : '';
    super(`Session expired${statusInfo} while fetching departement ${departement}${bodyInfo}`);
    this.name = 'SessionExpiredError';
  }
}

// Thrown on a 429: the site has just told us, in plain terms, to slow down.
// Retrying immediately (like the generic transient-failure path below) would
// only add to the flood; run.ts treats this as fatal for the whole run
// instead of ploughing through the remaining departements one by one.
// Carries whatever the response actually said (Retry-After header, body
// snippet) so a CI log answers "when can we try again?" instead of just
// "we got a 429" -- see curlGet for where these come from.
export class RateLimitedError extends Error {
  constructor(departement: string, retryAfter: string | undefined, bodySnippet: string) {
    const retryInfo = retryAfter ? `, Retry-After: ${retryAfter}` : ', no Retry-After header';
    super(
      `Rate limited while fetching departement ${departement}${retryInfo} -- body: ${bodySnippet}`
    );
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
): Promise<{ status: number; body: string; responseHeaders: Record<string, string> }> {
  const headerArgs = Object.entries(headers).flatMap(([key, value]) => ['-H', `${key}: ${value}`]);
  // -i prepends the response headers to the body, so a Retry-After (or
  // whatever else the site sends alongside a 429) is captured too, not just
  // the status code.
  const { stdout } = await execFileAsync(
    'curl',
    ['-s', '-i', '-o', '-', '-w', '\n%{http_code}', ...headerArgs, url],
    { maxBuffer: 10 * 1024 * 1024 }
  );
  const splitAt = stdout.lastIndexOf('\n');
  const status = Number(stdout.slice(splitAt + 1).trim());
  const headersAndBody = stdout.slice(0, splitAt);
  const boundary = headersAndBody.search(/\r\n\r\n|\n\n/);
  const rawHeaders = boundary === -1 ? '' : headersAndBody.slice(0, boundary);
  const body = boundary === -1 ? headersAndBody : headersAndBody.slice(boundary).replace(/^(\r\n\r\n|\n\n)/, '');
  const responseHeaders: Record<string, string> = {};
  for (const line of rawHeaders.split(/\r\n|\n/).slice(1)) {
    const colon = line.indexOf(':');
    if (colon > 0) {
      responseHeaders[line.slice(0, colon).trim().toLowerCase()] = line.slice(colon + 1).trim();
    }
  }
  return { body, status, responseHeaders };
}

export async function fetchDepartementCreneaux(
  departement: string,
  cookieHeader: string
): Promise<Creneau[]> {
  const attempt = async (): Promise<Creneau[]> => {
    const { status, body, responseHeaders } = await curlGet(
      `${API_BASE}?code-departement=${departement}`,
      { ...API_HEADERS, Cookie: cookieHeader }
    );
    if (status === 401 || status === 403) {
      throw new SessionExpiredError(departement, status, body.slice(0, 300));
    }
    if (status === 429) {
      throw new RateLimitedError(departement, responseHeaders['retry-after'], body.slice(0, 300));
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
