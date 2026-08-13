import { DEPARTEMENTS, MIN_DELAY_MS, MAX_DELAY_MS } from './config';
import { shouldRunCheck } from './schedule';
import { readState, writeState } from './storage';
import {
  fetchDepartementCreneaux,
  randomDelayMs,
  SessionExpiredError,
  RateLimitedError,
  loadPreFetchedCreneaux,
} from './checkSlots';
import { findNewCreneaux, creneauKey } from './diff';
import { formatNewCreneauxMessage, sendTelegramNotification } from './notify';
import type { Creneau, StateCreneau } from './types';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function run(now: Date = new Date()): Promise<void> {
  const previousState = await readState();
  const lastChecked = previousState ? previousState.lastChecked : null;

  if (!shouldRunCheck(lastChecked, now)) {
    console.log('Skipping run: threshold not reached since last check.');
    return;
  }

  // The cookie header comes from worker/login-container's browser-driven
  // login, run as a separate CI step before this one -- see
  // .github/workflows/check-slots.yml. A fresh cookie every run (rather than
  // caching and reusing one) since the automated login is now reliable
  // enough to not need a human, so there's nothing to save by reusing it.
  //
  // Neither this nor the pre-fetched browser data (loaded below) is
  // required on its own anymore - either can independently cover every
  // departement. Only fail outright here if there's truly nothing to work
  // with at all; a departement covered by neither will still correctly
  // fail on its own via fetchDepartementCreneaux's SessionExpiredError.
  const cookieHeader = process.env.COOKIE_HEADER ?? '';
  const preFetched = loadPreFetchedCreneaux('/tmp/rdvpermis-output/creneaux.json');
  if (!cookieHeader && preFetched.size === 0) {
    console.error(
      'No session cookie and no pre-fetched browser data - both login-container extraction methods failed this run'
    );
    process.exitCode = 1;
    return;
  }

  const previousCreneaux: Creneau[] = previousState ? previousState.creneaux : [];
  const allCreneaux: Creneau[] = [];

  for (const departement of DEPARTEMENTS) {
    try {
      const creneaux = await fetchDepartementCreneaux(departement, cookieHeader, preFetched);
      allCreneaux.push(...creneaux);
    } catch (error) {
      if (error instanceof SessionExpiredError) {
        // Not worth retrying with the same rejected cookie/session - a
        // fresh login-container run is what actually changes anything here.
        // (This used to say the login-container pre-verified the cookie via
        // a self-test API call before handing off - that self-test was
        // removed on 2026-08-03 because the duplicate request was itself
        // flaggable; the assumption that a same-session rejection this
        // quickly is necessarily anomalous no longer holds as originally
        // reasoned, though not retrying is still the right call on its own
        // merits.)
        console.error(`Session rejected while fetching departement ${departement}:`, error);
        process.exitCode = 1;
        return;
      }
      if (error instanceof RateLimitedError) {
        // Ploughing through the rest of DEPARTEMENTS would just rack up more
        // 429s against a limit the site just told us we've hit -- stop here
        // and leave the rest of this run's data as previousCreneaux, same as
        // the SessionExpiredError path above.
        console.error(`Rate limited while fetching departement ${departement}:`, error);
        process.exitCode = 1;
        return;
      }
      console.error(`Failed to fetch departement ${departement}, keeping previous data:`, error);
      allCreneaux.push(...previousCreneaux.filter((c) => c.departement === departement));
    }
    await sleep(randomDelayMs(MIN_DELAY_MS, MAX_DELAY_MS));
  }

  const newCreneaux = findNewCreneaux(previousCreneaux, allCreneaux);
  if (newCreneaux.length > 0) {
    try {
      await sendTelegramNotification(formatNewCreneauxMessage(newCreneaux));
    } catch (error) {
      console.error('Failed to send Telegram notification:', error);
      process.exitCode = 1;
    }
  }

  // Reuses the exact "new since last check" computation that drives the
  // Telegram notification above, so the dashboard's future "Nouveau" badge
  // and the Telegram alert can never disagree about what counts as new.
  // The explicit `isNew:` below always wins over whatever a creneau carried
  // in from the previousCreneaux fallback a few lines up (a departement
  // whose fetch failed reuses its previous StateCreneau objects, which
  // already have their own, now-stale, isNew field) -- object spread order
  // means the later, freshly-computed property always overrides the earlier
  // spread one.
  const newKeys = new Set(newCreneaux.map(creneauKey));
  const storedCreneaux: StateCreneau[] = allCreneaux.map((c) => ({
    ...c,
    isNew: newKeys.has(creneauKey(c)),
  }));

  try {
    await writeState({ creneaux: storedCreneaux, lastChecked: now.toISOString() });
  } catch (error) {
    console.error('Failed to write state to Blob:', error);
    process.exitCode = 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  run().catch((error) => {
    console.error('Unhandled error in run():', error);
    process.exitCode = 1;
  });
}
