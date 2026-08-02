# Worker — National Department Coverage + isNew Badge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand the worker from 10 Île-de-France departments to all 101 French departments, and persist an `isNew` flag per créneau in the Blob state so the (future) dashboard can show a "new" badge.

**Architecture:** No change to the verification loop's mechanism (`worker/src/run.ts` still loops `DEPARTEMENTS` sequentially with a randomized delay) — only the list itself grows. Separately, `run.ts` starts writing an `isNew`-augmented copy of each créneau to the Blob state, reusing the exact diff logic (`findNewCreneaux`) already used to decide what to notify on Telegram, so the two can never disagree about what counts as "new."

**Tech Stack:** TypeScript (worker, existing), Vitest (existing).

**Spec:** `docs/superpowers/specs/2026-08-02-worker-national-departements-design.md`

## Global Constraints

- The worker always checks every department in `DEPARTEMENTS` — department selection is never a
  worker-side concern; any future dashboard filter is display-only and out of scope for this plan.
- No change to the verification loop's mechanism, delay, or per-request behavior beyond the size
  of `DEPARTEMENTS` (`worker/src/run.ts`, `worker/src/checkSlots.ts` untouched).
- `isNew` means "present now, absent in the immediately previous check (~15 min earlier)" — the
  exact same rule `findNewCreneaux` already applies for the Telegram notification. No separate or
  longer-window "new" logic.
- Department codes are 3 characters: zero-padded numeric (`'001'`–`'095'`) for metropolitan
  departments, `'02A'`/`'02B'` for Corse, or the already-3-digit overseas codes (`'971'`–`'976'`).
  The Corse codes are a best-effort guess (consistent 3-character width, matching every other code
  in the list) and are **unverified against the live API** — flagged in Task 1, not blocking.
- Department **names** (code → label, e.g. `'069'` → `'Rhône'`) are out of scope here — a display
  concern for the follow-up dashboard-redesign spec, not touched in this plan.

---

## Task 1: Expand `DEPARTEMENTS` to all 101 French departments

**Files:**
- Modify: `worker/src/config.ts`
- Modify: `worker/src/config.test.ts`

**Interfaces:**
- Produces: `DEPARTEMENTS: string[]` (same exported name and type as today, now 101 entries instead
  of 10) — consumed unchanged by `worker/src/run.ts`'s existing loop and by Task 2's tests.

- [ ] **Step 1: Write the failing tests**

Replace the contents of `worker/src/config.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
  DEPARTEMENTS,
  PEAK_WINDOWS,
  PEAK_CHECK_INTERVAL_MINUTES,
  OFF_PEAK_CHECK_INTERVAL_MINUTES,
} from './config';

describe('config', () => {
  it('lists all 101 French departements as zero-padded, 3-character codes with no duplicates', () => {
    expect(DEPARTEMENTS).toHaveLength(101);
    expect(new Set(DEPARTEMENTS).size).toBe(101);
    expect(DEPARTEMENTS.every((d) => d.length === 3)).toBe(true);
  });

  it('includes the original 10 Ile-de-France departements this project started with', () => {
    for (const dep of ['078', '091', '092', '093', '094', '095', '027', '028', '060', '045']) {
      expect(DEPARTEMENTS).toContain(dep);
    }
  });

  it('includes metropolitan edge cases: first and last numeric codes, and Corse', () => {
    expect(DEPARTEMENTS).toContain('001'); // Ain
    expect(DEPARTEMENTS).toContain('095'); // Val-d'Oise, last numeric metropolitan code
    expect(DEPARTEMENTS).toContain('02A'); // Corse-du-Sud
    expect(DEPARTEMENTS).toContain('02B'); // Haute-Corse
    expect(DEPARTEMENTS).not.toContain('020'); // "20" does not exist as a department -- split into 2A/2B
  });

  it('includes all five overseas departements', () => {
    for (const dep of ['971', '972', '973', '974', '976']) {
      expect(DEPARTEMENTS).toContain(dep);
    }
  });

  it('defines the three peak windows from the spec', () => {
    expect(PEAK_WINDOWS).toEqual([
      { startHour: 8, endHour: 9 },
      { startHour: 12, endHour: 13 },
      { startHour: 17, endHour: 18 },
    ]);
  });

  it('sets a 15 min peak interval and 30 min off-peak interval', () => {
    expect(PEAK_CHECK_INTERVAL_MINUTES).toBe(15);
    expect(OFF_PEAK_CHECK_INTERVAL_MINUTES).toBe(30);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd worker
npm test -- config
```

Expected: FAIL — `DEPARTEMENTS` still has 10 entries, so the length/contains assertions for the
new codes fail.

- [ ] **Step 3: Write the implementation**

Replace the `DEPARTEMENTS` export in `worker/src/config.ts` (keep everything else in the file —
`PeakWindow`, `PEAK_WINDOWS`, `PEAK_CHECK_INTERVAL_MINUTES`, `OFF_PEAK_CHECK_INTERVAL_MINUTES`,
`MIN_DELAY_MS`, `MAX_DELAY_MS` — unchanged):

```typescript
// All 101 French departements (metropolitan 01-95, including 2A/2B for
// Corse instead of 20; overseas 971-974 and 976), zero-padded to match this
// API's established 3-character code format (confirmed for the original 10
// Ile-de-France codes, e.g. '078' not '78'). '02A'/'02B' are a best-effort
// guess at that same 3-character convention for Corse and have not been
// verified against the live API -- if slot data for Corse never appears,
// check the real code here first (the fetch failure is silent: run.ts logs
// it and keeps previous data for that departement, it doesn't break the run).
export const DEPARTEMENTS = [
  '001', '002', '003', '004', '005', '006', '007', '008', '009', '010',
  '011', '012', '013', '014', '015', '016', '017', '018', '019',
  '021', '022', '023', '024', '025', '026', '027', '028', '029',
  '02A', '02B',
  '030', '031', '032', '033', '034', '035', '036', '037', '038', '039',
  '040', '041', '042', '043', '044', '045', '046', '047', '048', '049',
  '050', '051', '052', '053', '054', '055', '056', '057', '058', '059',
  '060', '061', '062', '063', '064', '065', '066', '067', '068', '069',
  '070', '071', '072', '073', '074', '075', '076', '077', '078', '079',
  '080', '081', '082', '083', '084', '085', '086', '087', '088', '089',
  '090', '091', '092', '093', '094', '095',
  '971', '972', '973', '974', '976',
];
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- config
```

Expected: PASS, all 6 tests green.

- [ ] **Step 5: Typecheck and run the full worker suite**

```bash
npm run typecheck
npm test
```

Expected: no type errors. The full suite will also run `run.test.ts` and `checkSlots.test.ts` —
both already use `DEPARTEMENTS.length` / `DEPARTEMENTS[0]` dynamically rather than hardcoding 10,
so they should still pass unmodified at this step (Task 2 will touch `run.test.ts` for unrelated
reasons — the `isNew` field — not because of the department count).

- [ ] **Step 6: Commit**

```bash
git add worker/src/config.ts worker/src/config.test.ts
git commit -m "feat(worker): expand DEPARTEMENTS to all 101 French departments"
```

---

## Task 2: Persist `isNew` per créneau in the Blob state

**Files:**
- Modify: `worker/src/types.ts`
- Modify: `worker/src/diff.ts`
- Modify: `worker/src/run.ts`
- Modify: `worker/src/run.test.ts`
- Modify: `web/lib/state.ts`

**Interfaces:**
- Consumes: `DEPARTEMENTS` from Task 1 (unchanged shape, just longer — no interface change).
- Produces:
  - `StateCreneau` (new, `worker/src/types.ts`): `Creneau & { isNew: boolean }`.
  - `StateFile.creneaux` (changed, `worker/src/types.ts`): now `StateCreneau[]` instead of
    `Creneau[]`.
  - `creneauKey(c: Creneau): string` (newly exported, `worker/src/diff.ts` — was already defined,
    just not exported).
  - `web/lib/state.ts`'s `Creneau.isNew?: boolean` — optional, so no existing web-side test fixture
    needs updating in this task (nothing in `web/` reads or displays it yet — that's the follow-up
    dashboard-redesign spec's job).

- [ ] **Step 1: Write the failing tests**

Modify `worker/src/run.test.ts`. Three changes to the existing file:

**1a.** In the test `'keeps previous data for a departement whose fetch fails, and still succeeds'`
(around line 97), change only the final assertion from:

```typescript
    expect(mocks.writeState).toHaveBeenCalledWith(
      expect.objectContaining({ creneaux: expect.arrayContaining([previous]) })
    );
```

to:

```typescript
    expect(mocks.writeState).toHaveBeenCalledWith(
      expect.objectContaining({
        creneaux: expect.arrayContaining([{ ...previous, isNew: false }]),
      })
    );
```

(The rest of that test — the `readState`/`fetchDepartementCreneaux` mocks, the other assertions —
stays exactly as it is today.)

**1b.** In the test `'sets exitCode to 1 but still writes state when Telegram notification fails'`
(around line 150), change only the final assertion from:

```typescript
    expect(mocks.writeState).toHaveBeenCalledWith(
      expect.objectContaining({
        creneaux: expect.arrayContaining([
          { departement: DEPARTEMENTS[0], centre: 'Centre Test', date: '2026-08-14', heure: '14:30' },
        ]),
      })
    );
```

to:

```typescript
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
```

**1c.** Add a new test, right after the two above (anywhere inside the `describe('run', ...)`
block is fine — e.g. at the end, just before the closing `});` of the describe block):

```typescript
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
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd worker
npm test -- run.test
```

Expected: FAIL on all three changed/new assertions above — `run.ts` doesn't write an `isNew`
field yet, so the actual written objects don't match.

- [ ] **Step 3: Write the implementation**

**3a.** In `worker/src/types.ts`, add `StateCreneau` and change `StateFile.creneaux`'s type. Full
new file contents:

```typescript
export interface Creneau {
  departement: string;
  centre: string;
  date: string; // "YYYY-MM-DD", Europe/Paris local date
  heure: string; // "HH:MM", Europe/Paris local time
}

// A Creneau plus whether it's new since the previous check -- computed once,
// in run.ts, by diffing against the previous state. Kept separate from
// Creneau itself because nothing upstream of that diff (the API response
// parsing in checkSlots.ts, findNewCreneaux's own inputs in diff.ts) knows
// yet whether something is new.
export interface StateCreneau extends Creneau {
  isNew: boolean;
}

export interface StateFile {
  creneaux: StateCreneau[];
  lastChecked: string; // ISO 8601 timestamp of the last real check
}
```

**3b.** In `worker/src/diff.ts`, export the existing `creneauKey` function (only change: add
`export` in front of it). Full new file contents:

```typescript
import type { Creneau } from './types';

export function creneauKey(c: Creneau): string {
  return `${c.departement}|${c.centre}|${c.date}|${c.heure}`;
}

export function findNewCreneaux(previous: Creneau[], current: Creneau[]): Creneau[] {
  const previousKeys = new Set(previous.map(creneauKey));
  return current.filter((c) => !previousKeys.has(creneauKey(c)));
}
```

**3c.** In `worker/src/run.ts`, import `creneauKey` alongside `findNewCreneaux`, import
`StateCreneau` as a type, and build the `isNew`-augmented array right before `writeState`. Full
new file contents:

```typescript
import { DEPARTEMENTS, MIN_DELAY_MS, MAX_DELAY_MS } from './config';
import { shouldRunCheck } from './schedule';
import { readState, writeState } from './storage';
import { fetchDepartementCreneaux, randomDelayMs, SessionExpiredError } from './checkSlots';
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
  const cookieHeader = process.env.COOKIE_HEADER;
  if (!cookieHeader) {
    console.error('COOKIE_HEADER environment variable must be set');
    process.exitCode = 1;
    return;
  }

  const previousCreneaux: Creneau[] = previousState ? previousState.creneaux : [];
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
```

**3d.** In `web/lib/state.ts`, add the optional `isNew` field to the local `Creneau` interface
(only this interface changes — leave `getLatestState`, `StateFile`, everything else in the file
untouched):

```typescript
export interface Creneau {
  departement: string;
  centre: string;
  date: string;
  heure: string;
  isNew?: boolean;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd worker
npm test -- run.test
```

Expected: PASS, all tests in `run.test.ts` green (including the new one).

- [ ] **Step 5: Typecheck and run the full suites for both packages**

```bash
cd worker
npm run typecheck
npm test

cd ../web
npm run typecheck
npm test
```

Expected: no type errors in either package, all tests passing (`web`'s suite is unaffected since
`isNew` is optional there and nothing consumes it yet).

- [ ] **Step 6: Commit**

```bash
git add worker/src/types.ts worker/src/diff.ts worker/src/run.ts worker/src/run.test.ts web/lib/state.ts
git commit -m "feat(worker): persist isNew per creneau in the Blob state"
```
