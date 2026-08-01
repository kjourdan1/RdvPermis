import { DEPARTEMENTS, MIN_DELAY_MS, MAX_DELAY_MS } from './config';
import { shouldRunCheck } from './schedule';
import { readState, writeState } from './storage';
import { fetchDepartementCreneaux, randomDelayMs, SessionExpiredError } from './checkSlots';
import { findNewCreneaux } from './diff';
import { formatNewCreneauxMessage, sendTelegramNotification } from './notify';
import type { Creneau } from './types';

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
  const cookieHeader = process.env.COOKIE_HEADER;
  if (!cookieHeader) {
    console.error('COOKIE_HEADER environment variable must be set');
    process.exitCode = 1;
    return;
  }

  const previousCreneaux = previousState ? previousState.creneaux : [];
  const allCreneaux: Creneau[] = [];

  for (const departement of DEPARTEMENTS) {
    try {
      const creneaux = await fetchDepartementCreneaux(departement, cookieHeader);
      allCreneaux.push(...creneaux);
    } catch (error) {
      if (error instanceof SessionExpiredError) {
        // The login-container step already verified this same cookie against
        // this same API before handing off, so an expiry this quickly means
        // something is genuinely wrong rather than routine session aging --
        // not worth retrying with the same cookie.
        console.error(`Session rejected while fetching departement ${departement}:`, error);
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

  try {
    await writeState({ creneaux: allCreneaux, lastChecked: now.toISOString() });
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
