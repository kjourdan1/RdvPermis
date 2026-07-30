# RdvPermis-IDF Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an automated slot-checker for candidat.permisdeconduire.gouv.fr that periodically queries the internal creneaux API, notifies via Telegram only on genuinely new slots, and shows current availability on a public read-only dashboard.

**Architecture:** A `worker/` Node/TypeScript package runs exclusively inside a GitHub Actions cron (every 15 min, with in-code elapsed-time gating for the real 15/30 min cadence), logs in via Playwright, queries the creneaux API per département, diffs against the last state, notifies Telegram on new slots, and writes the full state to Vercel Blob. A separate `web/` Next.js package, deployed to Vercel, reads that same Blob state and renders it — no shared runtime, no access to credentials.

**Tech Stack:** Node.js + TypeScript, Playwright, Vitest, Next.js (App Router), @vercel/blob, GitHub Actions, Telegram Bot API.

## Global Constraints

- Two independent packages in one repo: `worker/` (Node/TS + Playwright, runs only in GitHub Actions, never deployed) and `web/` (Next.js, deployed to Vercel). No shared build/workspace tooling between them.
- Target départements (exact codes, zero-padded to 3 digits): `078, 091, 092, 093, 094, 095, 027, 028, 060, 045`.
- Random delay of 1000-2000ms between each département API call.
- Single GitHub Actions cron `*/15 * * * *`; the real 15 min (peak) / 30 min (off-peak) cadence is decided inside the worker code by comparing elapsed time since the last real check to a threshold — never by matching wall-clock minutes, and never by hardcoding UTC offsets for Paris time.
- Peak windows (15 min cadence): 8h-9h, 12h-13h, 17h-18h, Europe/Paris local time (DST-aware). Off-peak: 30 min cadence.
- No NEPH, date of birth, session cookie, or other credential may ever appear in: logs, versioned code, or the `web/` frontend. Secrets live only in GitHub Actions Secrets / Vercel environment variables.
- Telegram notifications are reserved exclusively for new-slot announcements. Run failures are surfaced via GitHub Actions' native failure email (job exits non-zero), never via Telegram.
- The system only checks and displays availability — it never books a slot automatically.
- `web/` is a public, unauthenticated dashboard (explicit user decision — no secrets ever reach it, so this is safe).
- Repo `RdvPermis-IDF` is public on GitHub (unlimited free Actions minutes).

---

## File Structure

```
RdvPermis-IDF/
├── .gitignore
├── README.md
├── .github/
│   └── workflows/
│       └── check-slots.yml
├── worker/
│   ├── package.json
│   ├── tsconfig.json
│   ├── vitest.config.ts
│   ├── .env.example
│   └── src/
│       ├── config.ts
│       ├── config.test.ts
│       ├── types.ts
│       ├── schedule.ts
│       ├── schedule.test.ts
│       ├── diff.ts
│       ├── diff.test.ts
│       ├── storage.ts
│       ├── storage.test.ts
│       ├── notify.ts
│       ├── notify.test.ts
│       ├── checkSlots.ts
│       ├── checkSlots.test.ts
│       ├── login.ts
│       ├── login.test.ts
│       └── run.ts
│       └── run.test.ts
└── web/
    ├── package.json
    ├── tsconfig.json
    ├── next.config.mjs
    ├── vitest.config.ts
    ├── .env.example
    ├── app/
    │   ├── layout.tsx
    │   └── page.tsx
    └── lib/
        ├── state.ts
        └── state.test.ts
```

---

### Task 1: Repo scaffolding + worker config

**Files:**
- Create: `.gitignore`
- Create: `worker/package.json`
- Create: `worker/tsconfig.json`
- Create: `worker/vitest.config.ts`
- Create: `worker/.env.example`
- Create: `worker/src/config.ts`
- Test: `worker/src/config.test.ts`

**Interfaces:**
- Produces: `DEPARTEMENTS: string[]`, `PeakWindow { startHour: number; endHour: number }`, `PEAK_WINDOWS: PeakWindow[]`, `PEAK_CHECK_INTERVAL_MINUTES: number`, `OFF_PEAK_CHECK_INTERVAL_MINUTES: number`, `MIN_DELAY_MS: number`, `MAX_DELAY_MS: number` — all from `worker/src/config.ts`.

- [ ] **Step 1: Create root `.gitignore`**

```
node_modules/
dist/
.next/
.env
.env.local
*.log
```

- [ ] **Step 2: Create `worker/package.json`**

```json
{
  "name": "worker",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "typecheck": "tsc --noEmit",
    "run": "tsx src/run.ts"
  },
  "dependencies": {
    "playwright": "^1.47.0",
    "@vercel/blob": "^0.27.0"
  },
  "devDependencies": {
    "typescript": "^5.6.0",
    "vitest": "^2.1.0",
    "tsx": "^4.19.0",
    "@types/node": "^22.7.0"
  }
}
```

- [ ] **Step 3: Create `worker/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

- [ ] **Step 4: Create `worker/vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
  },
});
```

- [ ] **Step 5: Create `worker/.env.example`**

```
NEPH=
DATE_NAISSANCE=1990-01-01
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
BLOB_READ_WRITE_TOKEN=
```

- [ ] **Step 6: Install dependencies**

Run: `cd worker && npm install`
Expected: `worker/node_modules/` and `worker/package-lock.json` are created, no errors.

- [ ] **Step 7: Write the failing test for config.ts**

```ts
// worker/src/config.test.ts
import { describe, it, expect } from 'vitest';
import {
  DEPARTEMENTS,
  PEAK_WINDOWS,
  PEAK_CHECK_INTERVAL_MINUTES,
  OFF_PEAK_CHECK_INTERVAL_MINUTES,
} from './config';

describe('config', () => {
  it('lists all ten target departements as 3-digit zero-padded codes', () => {
    expect(DEPARTEMENTS).toEqual([
      '078', '091', '092', '093', '094', '095', '027', '028', '060', '045',
    ]);
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

- [ ] **Step 8: Run test to verify it fails**

Run: `cd worker && npx vitest run src/config.test.ts`
Expected: FAIL — `Cannot find module './config'`

- [ ] **Step 9: Implement `worker/src/config.ts`**

```ts
export const DEPARTEMENTS = [
  '078', '091', '092', '093', '094', '095', '027', '028', '060', '045',
];

export interface PeakWindow {
  startHour: number;
  endHour: number;
}

export const PEAK_WINDOWS: PeakWindow[] = [
  { startHour: 8, endHour: 9 },
  { startHour: 12, endHour: 13 },
  { startHour: 17, endHour: 18 },
];

export const PEAK_CHECK_INTERVAL_MINUTES = 15;
export const OFF_PEAK_CHECK_INTERVAL_MINUTES = 30;
export const MIN_DELAY_MS = 1000;
export const MAX_DELAY_MS = 2000;
```

- [ ] **Step 10: Run test to verify it passes**

Run: `cd worker && npx vitest run src/config.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 11: Commit**

```bash
git add .gitignore worker/package.json worker/package-lock.json worker/tsconfig.json worker/vitest.config.ts worker/.env.example worker/src/config.ts worker/src/config.test.ts
git commit -m "feat(worker): scaffold worker package and add config"
```

---

### Task 2: Shared types + schedule logic

**Files:**
- Create: `worker/src/types.ts`
- Create: `worker/src/schedule.ts`
- Test: `worker/src/schedule.test.ts`

**Interfaces:**
- Consumes: `PEAK_WINDOWS`, `PEAK_CHECK_INTERVAL_MINUTES`, `OFF_PEAK_CHECK_INTERVAL_MINUTES` from `./config` (Task 1).
- Produces: `Creneau { departement: string; centre: string; date: string; heure: string }`, `StateFile { creneaux: Creneau[]; lastChecked: string }` from `./types`. `isPeakWindow(now: Date): boolean` and `shouldRunCheck(lastChecked: string | null, now: Date): boolean` from `./schedule`.

- [ ] **Step 1: Create `worker/src/types.ts`**

```ts
export interface Creneau {
  departement: string;
  centre: string;
  date: string; // "YYYY-MM-DD", Europe/Paris local date
  heure: string; // "HH:MM", Europe/Paris local time
}

export interface StateFile {
  creneaux: Creneau[];
  lastChecked: string; // ISO 8601 timestamp of the last real check
}
```

- [ ] **Step 2: Write the failing tests for schedule.ts**

```ts
// worker/src/schedule.test.ts
import { describe, it, expect } from 'vitest';
import { isPeakWindow, shouldRunCheck } from './schedule';

describe('isPeakWindow', () => {
  it('is true inside a peak window in winter (CET, UTC+1)', () => {
    // 2026-01-15T07:30:00Z = 08:30 Paris (CET)
    expect(isPeakWindow(new Date('2026-01-15T07:30:00Z'))).toBe(true);
  });

  it('is false outside any peak window in winter', () => {
    // 2026-01-15T09:30:00Z = 10:30 Paris (CET)
    expect(isPeakWindow(new Date('2026-01-15T09:30:00Z'))).toBe(false);
  });

  it('is true inside a peak window in summer (CEST, UTC+2), proving DST is handled', () => {
    // 2026-07-15T06:30:00Z = 08:30 Paris (CEST)
    expect(isPeakWindow(new Date('2026-07-15T06:30:00Z'))).toBe(true);
  });

  it('treats the window start as inclusive and the end as exclusive', () => {
    // 2026-01-15T11:00:00Z = 12:00 Paris -> inside [12,13)
    expect(isPeakWindow(new Date('2026-01-15T11:00:00Z'))).toBe(true);
    // 2026-01-15T12:00:00Z = 13:00 Paris -> outside [12,13)
    expect(isPeakWindow(new Date('2026-01-15T12:00:00Z'))).toBe(false);
  });
});

describe('shouldRunCheck', () => {
  it('returns true when there is no previous check', () => {
    expect(shouldRunCheck(null, new Date('2026-01-15T10:00:00Z'))).toBe(true);
  });

  it('returns false in a peak window when less than 15 min have elapsed', () => {
    // now = 08:30 Paris (peak), lastChecked = 08:20 Paris -> 10 min elapsed
    const lastChecked = '2026-01-15T07:20:00Z';
    const now = new Date('2026-01-15T07:30:00Z');
    expect(shouldRunCheck(lastChecked, now)).toBe(false);
  });

  it('returns true in a peak window when at least 15 min have elapsed', () => {
    // now = 08:30 Paris (peak), lastChecked = 08:10 Paris -> 20 min elapsed
    const lastChecked = '2026-01-15T07:10:00Z';
    const now = new Date('2026-01-15T07:30:00Z');
    expect(shouldRunCheck(lastChecked, now)).toBe(true);
  });

  it('returns false off-peak when less than 30 min have elapsed', () => {
    // now = 10:30 Paris (off-peak), lastChecked = 10:10 Paris -> 20 min elapsed
    const lastChecked = '2026-01-15T09:10:00Z';
    const now = new Date('2026-01-15T09:30:00Z');
    expect(shouldRunCheck(lastChecked, now)).toBe(false);
  });

  it('returns true off-peak when at least 30 min have elapsed, even at irregular minute marks', () => {
    // The exact scenario that motivated this design: last real check at
    // 14:43 Paris, current run lands at 15:17 Paris (neither is a clean
    // :00/:30 mark, but 34 min have genuinely elapsed and both are off-peak).
    const lastChecked = '2026-01-15T13:43:00Z'; // 14:43 Paris
    const now = new Date('2026-01-15T14:17:00Z'); // 15:17 Paris
    expect(shouldRunCheck(lastChecked, now)).toBe(true);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd worker && npx vitest run src/schedule.test.ts`
Expected: FAIL — `Cannot find module './schedule'`

- [ ] **Step 4: Implement `worker/src/schedule.ts`**

```ts
import {
  PEAK_WINDOWS,
  PEAK_CHECK_INTERVAL_MINUTES,
  OFF_PEAK_CHECK_INTERVAL_MINUTES,
} from './config';

export function isPeakWindow(now: Date): boolean {
  const parisHour = Number(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Paris',
      hour: 'numeric',
      hourCycle: 'h23',
    }).format(now)
  );
  return PEAK_WINDOWS.some(
    (window) => parisHour >= window.startHour && parisHour < window.endHour
  );
}

export function shouldRunCheck(lastChecked: string | null, now: Date): boolean {
  if (lastChecked === null) {
    return true;
  }
  const elapsedMinutes = (now.getTime() - new Date(lastChecked).getTime()) / (1000 * 60);
  const thresholdMinutes = isPeakWindow(now)
    ? PEAK_CHECK_INTERVAL_MINUTES
    : OFF_PEAK_CHECK_INTERVAL_MINUTES;
  return elapsedMinutes >= thresholdMinutes;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd worker && npx vitest run src/schedule.test.ts`
Expected: PASS (9 tests)

- [ ] **Step 6: Commit**

```bash
git add worker/src/types.ts worker/src/schedule.ts worker/src/schedule.test.ts
git commit -m "feat(worker): add shared types and elapsed-time schedule gating"
```

---

### Task 3: New-slot diff logic

**Files:**
- Create: `worker/src/diff.ts`
- Test: `worker/src/diff.test.ts`

**Interfaces:**
- Consumes: `Creneau` from `./types` (Task 2).
- Produces: `findNewCreneaux(previous: Creneau[], current: Creneau[]): Creneau[]` from `./diff`.

- [ ] **Step 1: Write the failing tests**

```ts
// worker/src/diff.test.ts
import { describe, it, expect } from 'vitest';
import { findNewCreneaux } from './diff';
import type { Creneau } from './types';

const a: Creneau = { departement: '078', centre: 'Centre A', date: '2026-08-14', heure: '14:30' };
const b: Creneau = { departement: '091', centre: 'Centre B', date: '2026-08-15', heure: '09:00' };

describe('findNewCreneaux', () => {
  it('returns every creneau as new when there was no previous state', () => {
    expect(findNewCreneaux([], [a, b])).toEqual([a, b]);
  });

  it('returns an empty array when nothing changed', () => {
    expect(findNewCreneaux([a, b], [a, b])).toEqual([]);
  });

  it('returns only the creneaux absent from the previous state', () => {
    expect(findNewCreneaux([a], [a, b])).toEqual([b]);
  });

  it('does not return a creneau that disappeared (no additions)', () => {
    expect(findNewCreneaux([a, b], [a])).toEqual([]);
  });

  it('treats a creneau that disappeared and reappeared as new again', () => {
    // previous state (this run) no longer has `a` -> it was already dropped
    // in an earlier write; now it is back, so it must be reported as new.
    expect(findNewCreneaux([b], [a, b])).toEqual([a]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd worker && npx vitest run src/diff.test.ts`
Expected: FAIL — `Cannot find module './diff'`

- [ ] **Step 3: Implement `worker/src/diff.ts`**

```ts
import type { Creneau } from './types';

function creneauKey(c: Creneau): string {
  return `${c.departement}|${c.centre}|${c.date}|${c.heure}`;
}

export function findNewCreneaux(previous: Creneau[], current: Creneau[]): Creneau[] {
  const previousKeys = new Set(previous.map(creneauKey));
  return current.filter((c) => !previousKeys.has(creneauKey(c)));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd worker && npx vitest run src/diff.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add worker/src/diff.ts worker/src/diff.test.ts
git commit -m "feat(worker): add new-slot diff logic"
```

---

### Task 4: State storage on Vercel Blob

**Files:**
- Create: `worker/src/storage.ts`
- Test: `worker/src/storage.test.ts`

**Interfaces:**
- Consumes: `StateFile` from `./types` (Task 2).
- Produces: `readState(): Promise<StateFile | null>`, `writeState(state: StateFile): Promise<void>` from `./storage`.

- [ ] **Step 1: Write the failing tests**

```ts
// worker/src/storage.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({ list: vi.fn(), put: vi.fn() }));
vi.mock('@vercel/blob', () => ({ list: mocks.list, put: mocks.put }));

import { readState, writeState } from './storage';

describe('storage', () => {
  beforeEach(() => {
    mocks.list.mockReset();
    mocks.put.mockReset();
    global.fetch = vi.fn();
  });

  it('returns null when no state blob exists yet', async () => {
    mocks.list.mockResolvedValue({ blobs: [] });
    expect(await readState()).toBeNull();
  });

  it('fetches and parses the state blob when it exists', async () => {
    mocks.list.mockResolvedValue({
      blobs: [{ pathname: 'creneaux.json', url: 'https://blob.example/creneaux.json' }],
    });
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ creneaux: [], lastChecked: '2026-01-15T07:30:00Z' }),
    });
    expect(await readState()).toEqual({ creneaux: [], lastChecked: '2026-01-15T07:30:00Z' });
  });

  it('writes the state as JSON to the fixed blob path, allowing overwrite', async () => {
    mocks.put.mockResolvedValue({});
    const state = { creneaux: [], lastChecked: '2026-01-15T07:30:00Z' };
    await writeState(state);
    expect(mocks.put).toHaveBeenCalledWith(
      'creneaux.json',
      JSON.stringify(state),
      expect.objectContaining({ allowOverwrite: true })
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd worker && npx vitest run src/storage.test.ts`
Expected: FAIL — `Cannot find module './storage'`

- [ ] **Step 3: Implement `worker/src/storage.ts`**

```ts
import { put, list } from '@vercel/blob';
import type { StateFile } from './types';

const STATE_BLOB_PATH = 'creneaux.json';

export async function readState(): Promise<StateFile | null> {
  const { blobs } = await list({ prefix: STATE_BLOB_PATH });
  const existing = blobs.find((b) => b.pathname === STATE_BLOB_PATH);
  if (!existing) {
    return null;
  }
  const response = await fetch(existing.url);
  if (!response.ok) {
    throw new Error(`Failed to fetch state blob: ${response.status}`);
  }
  return (await response.json()) as StateFile;
}

export async function writeState(state: StateFile): Promise<void> {
  await put(STATE_BLOB_PATH, JSON.stringify(state), {
    access: 'public',
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: 'application/json',
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd worker && npx vitest run src/storage.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add worker/src/storage.ts worker/src/storage.test.ts
git commit -m "feat(worker): read/write state to Vercel Blob"
```

---

### Task 5: Telegram notifications

**Files:**
- Create: `worker/src/notify.ts`
- Test: `worker/src/notify.test.ts`

**Interfaces:**
- Consumes: `Creneau` from `./types` (Task 2).
- Produces: `formatNewCreneauxMessage(creneaux: Creneau[]): string`, `sendTelegramNotification(message: string): Promise<void>` from `./notify`.

- [ ] **Step 1: Write the failing tests**

```ts
// worker/src/notify.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { formatNewCreneauxMessage, sendTelegramNotification } from './notify';

describe('formatNewCreneauxMessage', () => {
  it('includes the header line', () => {
    const message = formatNewCreneauxMessage([
      { departement: '078', centre: 'Centre de Versailles', date: '2026-08-14', heure: '14:30' },
    ]);
    expect(message).toContain('🚗 Nouveau créneau disponible !');
  });

  it('lists departement, centre and time for each new creneau', () => {
    const message = formatNewCreneauxMessage([
      { departement: '078', centre: 'Centre de Versailles', date: '2026-08-14', heure: '14:30' },
      { departement: '091', centre: 'Centre de Corbeil', date: '2026-08-15', heure: '09:00' },
    ]);
    expect(message).toContain('📍 Département 078 — Centre de Versailles');
    expect(message).toContain('à 14h30');
    expect(message).toContain('📍 Département 091 — Centre de Corbeil');
    expect(message).toContain('à 09h00');
  });
});

describe('sendTelegramNotification', () => {
  beforeEach(() => {
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_CHAT_ID;
    global.fetch = vi.fn();
  });

  it('throws when Telegram env vars are missing', async () => {
    await expect(sendTelegramNotification('hello')).rejects.toThrow(
      'TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID must be set'
    );
  });

  it('posts the message to the Telegram sendMessage endpoint', async () => {
    process.env.TELEGRAM_BOT_TOKEN = 'test-token';
    process.env.TELEGRAM_CHAT_ID = '12345';
    (global.fetch as any).mockResolvedValue({ ok: true });

    await sendTelegramNotification('hello');

    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.telegram.org/bottest-token/sendMessage',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ chat_id: '12345', text: 'hello' }),
      })
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd worker && npx vitest run src/notify.test.ts`
Expected: FAIL — `Cannot find module './notify'`

- [ ] **Step 3: Implement `worker/src/notify.ts`**

```ts
import type { Creneau } from './types';

export function formatNewCreneauxMessage(creneaux: Creneau[]): string {
  const lines = ['🚗 Nouveau créneau disponible !', ''];
  for (const c of creneaux) {
    lines.push(`📍 Département ${c.departement} — ${c.centre}`);
    lines.push(`📅 à ${c.heure.replace(':', 'h')} le ${c.date}`);
    lines.push('');
  }
  return lines.join('\n').trim();
}

export async function sendTelegramNotification(message: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    throw new Error('TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID must be set');
  }
  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: message }),
  });
  if (!response.ok) {
    throw new Error(`Telegram notification failed: ${response.status}`);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd worker && npx vitest run src/notify.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add worker/src/notify.ts worker/src/notify.test.ts
git commit -m "feat(worker): format and send Telegram notifications"
```

---

### Task 6: Creneaux API client

**Files:**
- Create: `worker/src/checkSlots.ts`
- Test: `worker/src/checkSlots.test.ts`

**Interfaces:**
- Consumes: `Creneau` from `./types` (Task 2).
- Produces: `parseApiResponse(departement: string, raw: unknown): Creneau[]`, `fetchDepartementCreneaux(departement: string, cookieHeader: string): Promise<Creneau[]>`, `randomDelayMs(min: number, max: number): number`, `class SessionExpiredError extends Error` from `./checkSlots`.

- [ ] **Step 1: Write the failing tests**

```ts
// worker/src/checkSlots.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  parseApiResponse,
  fetchDepartementCreneaux,
  randomDelayMs,
  SessionExpiredError,
} from './checkSlots';

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
    global.fetch = vi.fn();
  });

  it('returns parsed creneaux on success', async () => {
    (global.fetch as any).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [
        { centre: { nom: 'Centre A' }, creneaux: [{ dateDebut: '2026-08-14T12:30:00.000Z' }] },
      ],
    });
    const result = await fetchDepartementCreneaux('078', 'session=abc');
    expect(result).toEqual([
      { departement: '078', centre: 'Centre A', date: '2026-08-14', heure: '14:30' },
    ]);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('retries once after a transient failure and succeeds on the second attempt', async () => {
    (global.fetch as any)
      .mockResolvedValueOnce({ ok: false, status: 500 })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => [] });
    const result = await fetchDepartementCreneaux('078', 'session=abc');
    expect(result).toEqual([]);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('throws after two consecutive transient failures', async () => {
    (global.fetch as any).mockResolvedValue({ ok: false, status: 500 });
    await expect(fetchDepartementCreneaux('078', 'session=abc')).rejects.toThrow(
      'Creneaux API returned 500 for departement 078'
    );
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('throws SessionExpiredError immediately on a 401, without retrying', async () => {
    (global.fetch as any).mockResolvedValue({ ok: false, status: 401 });
    await expect(fetchDepartementCreneaux('078', 'session=abc')).rejects.toBeInstanceOf(
      SessionExpiredError
    );
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('throws SessionExpiredError immediately on a 403, without retrying', async () => {
    (global.fetch as any).mockResolvedValue({ ok: false, status: 403 });
    await expect(fetchDepartementCreneaux('078', 'session=abc')).rejects.toBeInstanceOf(
      SessionExpiredError
    );
    expect(global.fetch).toHaveBeenCalledTimes(1);
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd worker && npx vitest run src/checkSlots.test.ts`
Expected: FAIL — `Cannot find module './checkSlots'`

- [ ] **Step 3: Implement `worker/src/checkSlots.ts`**

```ts
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

export async function fetchDepartementCreneaux(
  departement: string,
  cookieHeader: string
): Promise<Creneau[]> {
  const attempt = async (): Promise<Creneau[]> => {
    const response = await fetch(`${API_BASE}?code-departement=${departement}`, {
      headers: {
        Cookie: cookieHeader,
        Accept: 'application/json, text/plain, */*',
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd worker && npx vitest run src/checkSlots.test.ts`
Expected: PASS (9 tests)

- [ ] **Step 5: Commit**

```bash
git add worker/src/checkSlots.ts worker/src/checkSlots.test.ts
git commit -m "feat(worker): add creneaux API client with retry and session-expiry detection"
```

---

### Task 7: Playwright login

**Files:**
- Create: `worker/src/login.ts`
- Test: `worker/src/login.test.ts`

**Interfaces:**
- Produces: `formatCookieHeader(cookies: Array<{ name: string; value: string }>): string`, `login(neph: string, dateNaissance: string): Promise<string>` from `./login`.

**Note:** the live login form's field selectors are unknown until inspected in a real browser — the constants below are best-guess placeholders that Step 6 requires you to verify and correct. This is the one part of the system that cannot be fully built from the spec alone.

- [ ] **Step 1: Write the failing test for the pure helper**

```ts
// worker/src/login.test.ts
import { describe, it, expect } from 'vitest';
import { formatCookieHeader } from './login';

describe('formatCookieHeader', () => {
  it('joins cookie name/value pairs with semicolons', () => {
    const header = formatCookieHeader([
      { name: 'JSESSIONID', value: 'abc123' },
      { name: 'XSRF-TOKEN', value: 'xyz789' },
    ]);
    expect(header).toBe('JSESSIONID=abc123; XSRF-TOKEN=xyz789');
  });

  it('returns an empty string for no cookies', () => {
    expect(formatCookieHeader([])).toBe('');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd worker && npx vitest run src/login.test.ts`
Expected: FAIL — `Cannot find module './login'`

- [ ] **Step 3: Implement `worker/src/login.ts`**

```ts
import { chromium } from 'playwright';

const LOGIN_URL = 'https://candidat.permisdeconduire.gouv.fr/';

// Best-guess selectors — MUST be verified against the live site (see Step 6
// of this task) before the first real run.
const NEPH_SELECTOR = 'input[name="username"]';
const DATE_NAISSANCE_SELECTOR = 'input[name="birthdate"]';
const SUBMIT_SELECTOR = 'button[type="submit"]';

export function formatCookieHeader(cookies: Array<{ name: string; value: string }>): string {
  return cookies.map((c) => `${c.name}=${c.value}`).join('; ');
}

export async function login(neph: string, dateNaissance: string): Promise<string> {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(LOGIN_URL, { waitUntil: 'networkidle' });
    await page.fill(NEPH_SELECTOR, neph);
    await page.fill(DATE_NAISSANCE_SELECTOR, dateNaissance);
    await page.click(SUBMIT_SELECTOR);
    await page.waitForURL('**/reservation', { timeout: 30000 });
    const cookies = await context.cookies();
    return formatCookieHeader(cookies);
  } finally {
    await browser.close();
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd worker && npx vitest run src/login.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add worker/src/login.ts worker/src/login.test.ts
git commit -m "feat(worker): add Playwright login and cookie formatting"
```

- [ ] **Step 6: Verify and fix the real selectors against the live site (manual, not automatable)**

1. Run `cd worker && npx playwright install chromium` (one-time browser download).
2. Open `https://candidat.permisdeconduire.gouv.fr/` in a real browser, open DevTools → Elements, and locate the actual login form. Note the real `name`/`id` attribute of the NEPH field, the date-of-naissance field, and the submit button.
3. Update `NEPH_SELECTOR`, `DATE_NAISSANCE_SELECTOR`, `SUBMIT_SELECTOR` at the top of `worker/src/login.ts` to match exactly what you found.
4. Copy `worker/.env.example` to `worker/.env`, fill in your real `NEPH` and `DATE_NAISSANCE`.
5. Create a throwaway script `worker/scratch-login-check.ts`:
   ```ts
   import 'dotenv/config';
   import { login } from './src/login.ts';

   login(process.env.NEPH!, process.env.DATE_NAISSANCE!)
     .then((cookieHeader) => {
       console.log('Login OK, cookie header length:', cookieHeader.length);
     })
     .catch((error) => {
       console.error('Login failed:', error);
       process.exit(1);
     });
   ```
6. Run: `cd worker && npm install dotenv && npx tsx scratch-login-check.ts`
   Expected: prints `Login OK, cookie header length: <N>` with N > 0, no uncaught error.
7. Delete `worker/scratch-login-check.ts` (it was only for this manual check) and remove the `dotenv` dependency from `worker/package.json` if `run.ts` (Task 8) does not end up needing it — GitHub Actions injects secrets as real environment variables, so `dotenv` is only useful for this local check.

---

### Task 8: Orchestration entry point

**Files:**
- Create: `worker/src/run.ts`
- Test: `worker/src/run.test.ts`
- Modify: `worker/package.json` (no change needed — `run` script already points at `src/run.ts` from Task 1)

**Interfaces:**
- Consumes: `DEPARTEMENTS, MIN_DELAY_MS, MAX_DELAY_MS` from `./config`; `shouldRunCheck` from `./schedule`; `readState, writeState` from `./storage`; `login` from `./login`; `fetchDepartementCreneaux, randomDelayMs, SessionExpiredError` from `./checkSlots`; `findNewCreneaux` from `./diff`; `formatNewCreneauxMessage, sendTelegramNotification` from `./notify`; `Creneau` from `./types`.
- Produces: `run(now?: Date): Promise<void>` from `./run` — sets `process.exitCode = 1` on structural failure (login failure, failed re-login after session expiry, or state-write failure) instead of throwing, so the GitHub Actions job fails cleanly and triggers GitHub's native failure email.

- [ ] **Step 1: Write the failing tests**

```ts
// worker/src/run.test.ts
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
    process.env.NEPH = 'test-neph';
    process.env.DATE_NAISSANCE = '1990-01-01';
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
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd worker && npx vitest run src/run.test.ts`
Expected: FAIL — `Cannot find module './run'`

- [ ] **Step 3: Implement `worker/src/run.ts`**

```ts
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
    await sendTelegramNotification(formatNewCreneauxMessage(newCreneaux));
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd worker && npx vitest run src/run.test.ts`
Expected: PASS (8 tests)

- [ ] **Step 5: Run the full worker test suite**

Run: `cd worker && npm test`
Expected: PASS — all test files (config, schedule, diff, storage, notify, checkSlots, login, run) green.

- [ ] **Step 6: Commit**

```bash
git add worker/src/run.ts worker/src/run.test.ts
git commit -m "feat(worker): wire orchestration entry point with error handling"
```

---

### Task 9: GitHub repo, secrets, workflow, and end-to-end verification

**Files:**
- Create: `.github/workflows/check-slots.yml`

**Interfaces:**
- Consumes: `worker/package.json` `run` script (Task 1) which executes `worker/src/run.ts` (Task 8).

- [ ] **Step 1: Create a Telegram bot**

1. In Telegram, message `@BotFather`, send `/newbot`, follow the prompts. Copy the bot token it gives you (looks like `123456789:ABCdefGhIJKlmnoPQRstuVwxyZ`).
2. Send any message to your new bot so it registers a chat with you.
3. Run: `curl "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getUpdates"` and read the numeric `"chat":{"id": ...}` value from the JSON response — that is your `TELEGRAM_CHAT_ID`.

- [ ] **Step 2: Create the Vercel Blob store**

1. Go to the Vercel dashboard → Storage tab → Create Database → Blob.
2. Name it (e.g. `rdvpermis-state`) and create it.
3. Copy the `BLOB_READ_WRITE_TOKEN` shown in the connection snippet Vercel provides.

- [ ] **Step 3: Create and push the GitHub repository**

Run:
```bash
gh repo create RdvPermis-IDF --public --source=. --remote=origin --push
```
Expected: repo created at `github.com/<your-username>/RdvPermis-IDF`, current branch pushed.

- [ ] **Step 4: Set GitHub Actions secrets**

Run (replace each `<...>` with your real value):
```bash
gh secret set NEPH --body "<your-neph>"
gh secret set DATE_NAISSANCE --body "<your-date-naissance>"
gh secret set TELEGRAM_BOT_TOKEN --body "<your-telegram-bot-token>"
gh secret set TELEGRAM_CHAT_ID --body "<your-telegram-chat-id>"
gh secret set BLOB_READ_WRITE_TOKEN --body "<your-vercel-blob-token>"
```

- [ ] **Step 5: Create the workflow file**

```yaml
# .github/workflows/check-slots.yml
name: Check RdvPermis slots

on:
  schedule:
    - cron: '*/15 * * * *'
  workflow_dispatch: {}

jobs:
  check:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: worker
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: worker/package-lock.json

      - name: Install dependencies
        run: npm ci

      - name: Install Playwright browsers
        run: npx playwright install --with-deps chromium

      - name: Run slot check
        env:
          NEPH: ${{ secrets.NEPH }}
          DATE_NAISSANCE: ${{ secrets.DATE_NAISSANCE }}
          TELEGRAM_BOT_TOKEN: ${{ secrets.TELEGRAM_BOT_TOKEN }}
          TELEGRAM_CHAT_ID: ${{ secrets.TELEGRAM_CHAT_ID }}
          BLOB_READ_WRITE_TOKEN: ${{ secrets.BLOB_READ_WRITE_TOKEN }}
        run: npm run run
```

- [ ] **Step 6: Commit and push**

```bash
git add .github/workflows/check-slots.yml
git commit -m "ci: add scheduled workflow to run the slot checker"
git push
```

- [ ] **Step 7: Trigger and verify an end-to-end run**

Run:
```bash
gh workflow run "Check RdvPermis slots"
gh run watch
```
Expected: the run completes without an unhandled error (green check). Open the run log and confirm each département in `DEPARTEMENTS` was queried. If real login selectors from Task 7 Step 6 are correct and slots happen to be available, a Telegram message arrives; if none are available, no message is expected — that is correct behavior, not a failure.

---

### Task 10: Web package scaffolding + Blob state reader

**Files:**
- Create: `web/package.json`
- Create: `web/tsconfig.json`
- Create: `web/next.config.mjs`
- Create: `web/vitest.config.ts`
- Create: `web/.env.example`
- Create: `web/lib/state.ts`
- Test: `web/lib/state.test.ts`

**Interfaces:**
- Produces: `Creneau`, `StateFile` (duplicated locally — `web/` is an independently deployed package with no shared build to `worker/`), `getLatestState(): Promise<StateFile | null>` from `web/lib/state.ts`.

- [ ] **Step 1: Create `web/package.json`**

```json
{
  "name": "web",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "next": "^15.0.0",
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "@vercel/blob": "^0.27.0"
  },
  "devDependencies": {
    "typescript": "^5.6.0",
    "@types/react": "^18.3.0",
    "@types/node": "^22.7.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2: Create `web/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "paths": {
      "@/*": ["./*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 3: Create `web/next.config.mjs`**

```js
/** @type {import('next').NextConfig} */
const nextConfig = {};
export default nextConfig;
```

- [ ] **Step 4: Create `web/vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
  },
});
```

- [ ] **Step 5: Create `web/.env.example`**

```
BLOB_READ_WRITE_TOKEN=
```

- [ ] **Step 6: Install dependencies**

Run: `cd web && npm install`
Expected: `web/node_modules/` and `web/package-lock.json` created, no errors.

- [ ] **Step 7: Write the failing tests for state.ts**

```ts
// web/lib/state.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({ list: vi.fn() }));
vi.mock('@vercel/blob', () => ({ list: mocks.list }));

import { getLatestState } from './state';

describe('getLatestState', () => {
  beforeEach(() => {
    mocks.list.mockReset();
    global.fetch = vi.fn();
  });

  it('returns null when no state blob exists', async () => {
    mocks.list.mockResolvedValue({ blobs: [] });
    expect(await getLatestState()).toBeNull();
  });

  it('fetches and returns the parsed state when the blob exists', async () => {
    mocks.list.mockResolvedValue({
      blobs: [{ pathname: 'creneaux.json', url: 'https://blob.example/creneaux.json' }],
    });
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ creneaux: [], lastChecked: '2026-01-15T09:00:00Z' }),
    });
    expect(await getLatestState()).toEqual({ creneaux: [], lastChecked: '2026-01-15T09:00:00Z' });
  });
});
```

- [ ] **Step 8: Run tests to verify they fail**

Run: `cd web && npx vitest run lib/state.test.ts`
Expected: FAIL — `Cannot find module './state'`

- [ ] **Step 9: Implement `web/lib/state.ts`**

```ts
import { list } from '@vercel/blob';

export interface Creneau {
  departement: string;
  centre: string;
  date: string;
  heure: string;
}

export interface StateFile {
  creneaux: Creneau[];
  lastChecked: string;
}

const STATE_BLOB_PATH = 'creneaux.json';

export async function getLatestState(): Promise<StateFile | null> {
  const { blobs } = await list({ prefix: STATE_BLOB_PATH });
  const existing = blobs.find((b) => b.pathname === STATE_BLOB_PATH);
  if (!existing) {
    return null;
  }
  const response = await fetch(existing.url, { next: { revalidate: 120 } });
  if (!response.ok) {
    throw new Error(`Failed to fetch state blob: ${response.status}`);
  }
  return (await response.json()) as StateFile;
}
```

- [ ] **Step 10: Run tests to verify they pass**

Run: `cd web && npx vitest run lib/state.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 11: Commit**

```bash
git add web/package.json web/package-lock.json web/tsconfig.json web/next.config.mjs web/vitest.config.ts web/.env.example web/lib/state.ts web/lib/state.test.ts
git commit -m "feat(web): scaffold Next.js package and add Blob state reader"
```

---

### Task 11: Dashboard page

**Files:**
- Create: `web/app/layout.tsx`
- Create: `web/app/page.tsx`

**Interfaces:**
- Consumes: `getLatestState` from `../lib/state` (Task 10).

- [ ] **Step 1: Create `web/app/layout.tsx`**

```tsx
export const metadata = {
  title: 'RdvPermis-IDF',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 2: Create `web/app/page.tsx`**

```tsx
import { getLatestState } from '../lib/state';

export const revalidate = 120;

function formatHeure(heure: string): string {
  return heure.replace(':', 'h');
}

export default async function DashboardPage() {
  const state = await getLatestState();
  const creneaux = state?.creneaux ?? [];
  const lastChecked = state?.lastChecked;

  return (
    <main style={{ fontFamily: 'sans-serif', padding: '1.5rem', maxWidth: '800px', margin: '0 auto' }}>
      <h1>RdvPermis-IDF — Créneaux disponibles</h1>
      <p>
        Dernière vérification :{' '}
        {lastChecked
          ? new Date(lastChecked).toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })
          : 'jamais'}
      </p>
      {creneaux.length === 0 ? (
        <p>Aucun créneau disponible pour le moment.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>Département</th>
              <th style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>Centre</th>
              <th style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>Date</th>
              <th style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>Heure</th>
            </tr>
          </thead>
          <tbody>
            {creneaux.map((c, i) => (
              <tr
                key={`${c.departement}-${c.centre}-${c.date}-${c.heure}-${i}`}
                style={{ backgroundColor: '#e6ffed' }}
              >
                <td>{c.departement}</td>
                <td>{c.centre}</td>
                <td>{new Date(`${c.date}T00:00:00`).toLocaleDateString('fr-FR')}</td>
                <td>{formatHeure(c.heure)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
```

- [ ] **Step 3: Verify the project builds**

Run: `cd web && npm run build`
Expected: build succeeds (this also generates `next-env.d.ts`), no type errors.

- [ ] **Step 4: Manual verification in the browser**

Run: `cd web && BLOB_READ_WRITE_TOKEN=<your-vercel-blob-token> npm run dev`
Open `http://localhost:3000`.
Expected (golden path): if `creneaux.json` already has data (from Task 9's end-to-end run), the table renders with département/centre/date/heure rows on a light-green background, and the "Dernière vérification" timestamp is populated.
Expected (empty case): if no data yet, "Aucun créneau disponible pour le moment." is shown instead of a table, and "Dernière vérification : jamais" is shown.

- [ ] **Step 5: Commit**

```bash
git add web/app/layout.tsx web/app/page.tsx
git commit -m "feat(web): add dashboard page reading from Blob state"
```

---

### Task 12: Deploy the dashboard + write the README

**Files:**
- Create: `README.md`

**Interfaces:**
- None (deployment + documentation task).

- [ ] **Step 1: Deploy `web/` to Vercel**

Run:
```bash
npm install -g vercel   # skip if already installed
cd web
vercel link --yes
vercel env add BLOB_READ_WRITE_TOKEN production
# paste the same token created in Task 9, Step 2
vercel --prod
```
Expected: a production URL is printed (e.g. `https://rdvpermis-idf.vercel.app`); opening it shows the same dashboard verified locally in Task 11.

- [ ] **Step 2: Write `README.md`**

```markdown
# RdvPermis-IDF

Vérification automatique des créneaux d'examen du permis de conduire (candidat.permisdeconduire.gouv.fr)
pour les départements 78, 91, 92, 93, 94, 95, 27, 28, 60, 45. Vérifie et affiche la disponibilité —
ne réserve jamais automatiquement.

## Comment ça marche

- `worker/` tourne uniquement dans un workflow GitHub Actions planifié toutes les 15 min. Il se connecte
  via Playwright, interroge l'API interne des créneaux pour chaque département, notifie sur Telegram
  uniquement les créneaux réellement nouveaux, et écrit l'état complet dans Vercel Blob.
- `web/` est un dashboard Next.js déployé sur Vercel qui lit cet état et l'affiche, sans authentification.

## Déploiement depuis zéro

1. **Bot Telegram** : parler à `@BotFather` sur Telegram, `/newbot`, récupérer le token. Envoyer un
   message au bot, puis `curl "https://api.telegram.org/bot<TOKEN>/getUpdates"` pour récupérer le
   `chat_id`.
2. **Vercel Blob** : dashboard Vercel → Storage → Create Database → Blob. Copier le
   `BLOB_READ_WRITE_TOKEN`.
3. **Repo GitHub** : `gh repo create RdvPermis-IDF --public --source=. --remote=origin --push`.
4. **Secrets GitHub Actions** :
   ```bash
   gh secret set NEPH --body "<votre-neph>"
   gh secret set DATE_NAISSANCE --body "<votre-date-naissance>"
   gh secret set TELEGRAM_BOT_TOKEN --body "<votre-token-bot>"
   gh secret set TELEGRAM_CHAT_ID --body "<votre-chat-id>"
   gh secret set BLOB_READ_WRITE_TOKEN --body "<votre-token-blob>"
   ```
5. **Déploiement Vercel** :
   ```bash
   cd web
   vercel link --yes
   vercel env add BLOB_READ_WRITE_TOKEN production
   vercel --prod
   ```
6. Déclencher un premier run manuel : `gh workflow run "Check RdvPermis slots"` puis `gh run watch`.

## Configuration

- **Ajouter/retirer un département** : modifier le tableau `DEPARTEMENTS` dans `worker/src/config.ts`
  (codes sur 3 chiffres, zero-paddés, ex: `"078"`).
- **Changer les fenêtres de pointe ou la fréquence** : modifier `PEAK_WINDOWS`,
  `PEAK_CHECK_INTERVAL_MINUTES`, `OFF_PEAK_CHECK_INTERVAL_MINUTES` dans `worker/src/config.ts`.
  Ces heures sont interprétées en heure de Paris (CET/CEST géré automatiquement).
- **Changer le délai entre appels API** : `MIN_DELAY_MS` / `MAX_DELAY_MS` dans `worker/src/config.ts`.

## Sécurité

Aucun identifiant, cookie de session ou donnée personnelle n'est stocké ailleurs que dans les secrets
GitHub Actions. Le fichier d'état lu par le dashboard (`creneaux.json`) ne contient que département,
centre, date, heure, et horodatage de dernière vérification.

## Tests

```bash
cd worker && npm test
cd web && npm test
```
```

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: add deployment and configuration instructions"
git push
```

---

## Self-Review

**Spec coverage:**
- Architecture (worker/web split, no Playwright in Vercel bundle) → Task 1, Task 10.
- Secrets/security guarantees → Task 1 (`.env.example`, `.gitignore`), Task 9 (GitHub Secrets), Task 12 (README security section), never logged/exposed anywhere in worker or web code.
- Diff/new-slot detection and re-notify-on-reappearance → Task 3.
- Elapsed-time scheduling gate (the exact 14h43→15h17 fix the user requested) → Task 2, directly tested.
- Error-handling table (login failure, département failure, session expiry mid-run, bad JSON shape, Blob write failure) → Task 6 (SessionExpiredError, retry), Task 8 (`run.ts` implements all five rows and is tested for each).
- Telegram-only-for-slots / GitHub-native-email-for-failures → Task 5 (notify.ts has no failure-path calls), Task 8 (`process.exitCode = 1` on structural failures, no custom email code).
- Cron `*/15 * * * *` with code-side gating → Task 2 (schedule.ts), Task 9 (workflow file).
- Dashboard (table, colors, no auth) → Task 11.
- Deliverables (repo, workflow, README, config docs) → Task 9, Task 12.
No gaps found.

**Placeholder scan:** No TBD/TODO markers. The one inherently-unknowable item (live login form selectors) is handled with working best-guess code plus an explicit, concrete manual verification procedure (Task 7, Step 6) rather than a vague instruction.

**Type consistency:** `Creneau` and `StateFile` fields (`departement`, `centre`, `date`, `heure`, `lastChecked`) are identical across `types.ts`, `diff.ts`, `storage.ts`, `checkSlots.ts`, `notify.ts`, `run.ts`, and the duplicated `web/lib/state.ts`. Function names match between producer and consumer tasks: `readState`/`writeState` (Task 4 → Task 8), `findNewCreneaux` (Task 3 → Task 8), `fetchDepartementCreneaux`/`randomDelayMs`/`SessionExpiredError` (Task 6 → Task 8), `login` (Task 7 → Task 8), `formatNewCreneauxMessage`/`sendTelegramNotification` (Task 5 → Task 8), `shouldRunCheck` (Task 2 → Task 8), `DEPARTEMENTS`/`MIN_DELAY_MS`/`MAX_DELAY_MS` (Task 1 → Task 8), `getLatestState` (Task 10 → Task 11).
