import { DEPARTEMENTS, MIN_DELAY_MS, MAX_DELAY_MS } from './config';
import { shouldRunCheck } from './schedule';
import { readState, writeState } from './storage';
import { login } from './login';
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

  const neph = process.env.NEPH;
  const dateNaissance = process.env.DATE_NAISSANCE;
  if (!neph || !dateNaissance) {
    console.error('NEPH and DATE_NAISSANCE environment variables must be set');
    process.exitCode = 1;
    return;
  }

  let cookieHeader: string;
  try {
    cookieHeader = await login(neph, dateNaissance);
  } catch (error) {
    console.error('Login failed:', error);
    process.exitCode = 1;
    return;
  }

  const previousCreneaux = previousState ? previousState.creneaux : [];
  const allCreneaux: Creneau[] = [];
  let sessionRetried = false;

  for (const departement of DEPARTEMENTS) {
    try {
      const creneaux = await fetchDepartementCreneaux(departement, cookieHeader);
      allCreneaux.push(...creneaux);
    } catch (error) {
      if (error instanceof SessionExpiredError && !sessionRetried) {
        sessionRetried = true;
        try {
          cookieHeader = await login(neph, dateNaissance);
          const creneaux = await fetchDepartementCreneaux(departement, cookieHeader);
          allCreneaux.push(...creneaux);
          await sleep(randomDelayMs(MIN_DELAY_MS, MAX_DELAY_MS));
          continue;
        } catch (reloginError) {
          console.error('Re-login after session expiry failed:', reloginError);
          process.exitCode = 1;
          return;
        }
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
