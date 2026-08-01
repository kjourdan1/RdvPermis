import type { Creneau } from './types';

export class SessionExpiredError extends Error {
  constructor(departement: string) {
    super(`Session expired while fetching departement ${departement}`);
    this.name = 'SessionExpiredError';
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

// Cloudflare 403s a bare Node fetch's default User-Agent regardless of an
// otherwise-valid session cookie; a realistic browser UA is enough to pass.
const USER_AGENT =
  'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36';

export async function fetchDepartementCreneaux(
  departement: string,
  cookieHeader: string
): Promise<Creneau[]> {
  const attempt = async (): Promise<Creneau[]> => {
    const response = await fetch(`${API_BASE}?code-departement=${departement}`, {
      headers: {
        Cookie: cookieHeader,
        Accept: 'application/json, text/plain, */*',
        'User-Agent': USER_AGENT,
      },
    });
    if (response.status === 401 || response.status === 403) {
      throw new SessionExpiredError(departement);
    }
    if (!response.ok) {
      throw new Error(`Creneaux API returned ${response.status} for departement ${departement}`);
    }
    return parseApiResponse(departement, await response.json());
  };

  try {
    return await attempt();
  } catch (error) {
    if (error instanceof SessionExpiredError) {
      throw error;
    }
    return await attempt();
  }
}

export function randomDelayMs(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
