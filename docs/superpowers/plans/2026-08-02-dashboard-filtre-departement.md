# Dashboard — filtre + groupement par département Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a multi-select, URL-persisted department filter to the `web/` dashboard, group the créneaux table by department, and restyle the page with shadcn/ui + Tailwind CSS.

**Architecture:** `app/page.tsx` stays a single async Server Component. It reads `searchParams.dep`, runs it and the Blob-sourced créneaux through pure functions in `lib/creneaux.ts` (filter + group + sort), and renders the result through two small presentational components. Filter chips are plain `<Link>`s that change the URL query string — no client-side state, no new Client Component except the Next.js-mandated `app/error.tsx`.

**Tech Stack:** Next.js 15 (App Router, existing), Vitest (existing), shadcn/ui + Tailwind CSS (new).

**Spec:** `docs/superpowers/specs/2026-08-02-dashboard-filtre-departement-design.md`

## Global Constraints

- Next.js 15: `searchParams` in a page's props is a `Promise` — must be `await`-ed, not read directly.
- All user-visible text stays in French, consistent with the existing page.
- Everything stays a Server Component except `app/error.tsx`, which Next.js requires to be a Client Component (`"use client"`).
- No new runtime dependency beyond shadcn/ui + Tailwind CSS — no state management library, no client-side fetching.
- `web/lib/state.ts` and `web/lib/state.test.ts` are not touched.
- The `DEPARTEMENTS` list (`078, 091, 092, 093, 094, 095, 027, 028, 060, 045`) is duplicated from `worker/src/config.ts` — `web/` cannot import across the two separate deployments.
- Use shadcn tokens (`text-muted-foreground`, `bg-background`, etc.) rather than hardcoded colors.

---

## Task 1: Add Tailwind CSS + shadcn/ui to `web/`

**Files:**
- Create (via CLI): `web/components.json`, `web/app/globals.css` (or wherever the CLI places it), `web/lib/utils.ts`, `web/components/ui/badge.tsx`, `web/components/ui/table.tsx`, `web/components/ui/button.tsx`, a Tailwind config file
- Modify: `web/package.json`, `web/package-lock.json` (new deps, written by the CLI/npm)
- Modify: `web/app/layout.tsx` (import the generated global stylesheet, if the CLI didn't already wire it)

**Interfaces:**
- Produces: `Badge` from `@/components/ui/badge`, `Table`/`TableHeader`/`TableBody`/`TableRow`/`TableHead`/`TableCell` from `@/components/ui/table`, `Button` from `@/components/ui/button`, `cn()` from `@/lib/utils` — all used by later tasks.

- [ ] **Step 1: Run the non-interactive shadcn init**

```bash
cd web
npx shadcn@latest init -d
```

This detects the Next.js App Router project, installs Tailwind + Radix + `class-variance-authority` + `clsx` + `tailwind-merge`, and creates `components.json`, the global stylesheet, and `lib/utils.ts`.

- [ ] **Step 2: Verify `app/layout.tsx` imports the global stylesheet**

Open `web/app/layout.tsx`. If it does not already import the CSS file the init step created (commonly `./globals.css`), add the import at the top of the file, e.g.:

```tsx
import './globals.css';
```

- [ ] **Step 3: Fix a known shadcn/Next.js gotcha if present**

Open the generated global stylesheet. If it contains a self-referential font declaration like:

```css
--font-sans: var(--font-sans);
```

replace it with a literal system font stack (this project does not use `next/font`):

```css
--font-sans: ui-sans-serif, system-ui, sans-serif;
```

If the file doesn't have this pattern, skip this step.

- [ ] **Step 4: Add the three shadcn components this plan needs**

```bash
npx shadcn@latest add badge table button
```

Verify `web/components/ui/badge.tsx`, `web/components/ui/table.tsx`, and `web/components/ui/button.tsx` now exist.

- [ ] **Step 5: Verify the project still builds**

```bash
npm run build
```

Expected: build succeeds (the old `app/page.tsx` still works unstyled-but-functional at this point — this step only proves the Tailwind/shadcn scaffolding itself is sound).

- [ ] **Step 6: Commit**

```bash
git add web/components.json web/lib/utils.ts web/components/ui web/package.json web/package-lock.json web/app/layout.tsx web/app/globals.css web/tailwind.config.* 2>/dev/null
git commit -m "chore(web): add Tailwind CSS + shadcn/ui (badge, table, button)"
```

(Adjust the exact `git add` file list to whatever the CLI actually created — check `git status` first.)

---

## Task 2: `lib/creneaux.ts` — filtering, grouping, and URL logic (TDD)

**Files:**
- Create: `web/lib/creneaux.ts`
- Create: `web/lib/creneaux.test.ts`

**Interfaces:**
- Consumes: `Creneau` type from `web/lib/state.ts` (existing: `{ departement: string; centre: string; date: string; heure: string }`).
- Produces:
  - `DEPARTEMENTS: string[]` — canonical ordered list of the 10 valid codes.
  - `interface CreneauGroupData { departement: string; creneaux: Creneau[] }`
  - `parseSelectedDepartements(depParam: string | undefined): string[]`
  - `filterAndGroup(creneaux: Creneau[], selected: string[]): CreneauGroupData[]`
  - `buildFilterHref(selected: string[], departement: string): string`
  - `formatHeure(heure: string): string`
  - All consumed by Tasks 3, 4, and 5.

**Behavior contract (from the spec, made explicit):**
- `parseSelectedDepartements(undefined)` and `parseSelectedDepartements('')` both return the full `DEPARTEMENTS` list (spec: "tout coché si absent/vide").
- Any provided value not in `DEPARTEMENTS` is silently dropped. If every provided value is invalid, the result is an **empty array** (not a fallback to "all") — an explicit selection, even a fully-invalid one, is taken at face value.
- The returned order always follows `DEPARTEMENTS`' canonical order, regardless of the order values appeared in the query string.
- `filterAndGroup` only returns groups for departments that are both selected and have at least one créneau.
- Within a group, créneaux are sorted by `date` ascending, then `heure` ascending.
- `buildFilterHref` toggles one department in/out of the current selection. Removing the last selected department returns the bare string `'?'` (which `parseSelectedDepartements` will read back as "empty" → "all" — this is a deliberate, not accidental, way to make "select none" behave as a full reset).

- [ ] **Step 1: Write the failing tests**

Create `web/lib/creneaux.test.ts`:

```typescript
// web/lib/creneaux.test.ts
import { describe, it, expect } from 'vitest';
import {
  DEPARTEMENTS,
  parseSelectedDepartements,
  filterAndGroup,
  buildFilterHref,
  formatHeure,
} from './creneaux';
import type { Creneau } from './state';

describe('parseSelectedDepartements', () => {
  it('returns all departements when param is undefined', () => {
    expect(parseSelectedDepartements(undefined)).toEqual(DEPARTEMENTS);
  });

  it('returns all departements when param is an empty string', () => {
    expect(parseSelectedDepartements('')).toEqual(DEPARTEMENTS);
  });

  it('returns only the requested departements, in canonical order', () => {
    expect(parseSelectedDepartements('095,078')).toEqual(['078', '095']);
  });

  it('silently drops values that are not valid departement codes', () => {
    expect(parseSelectedDepartements('078,999,091')).toEqual(['078', '091']);
  });

  it('returns an empty array when every provided value is invalid', () => {
    expect(parseSelectedDepartements('999,888')).toEqual([]);
  });
});

describe('filterAndGroup', () => {
  const creneaux: Creneau[] = [
    { departement: '078', centre: 'Centre A', date: '2026-08-10', heure: '09:00' },
    { departement: '078', centre: 'Centre B', date: '2026-08-05', heure: '14:00' },
    { departement: '091', centre: 'Centre C', date: '2026-08-05', heure: '08:00' },
    { departement: '092', centre: 'Centre D', date: '2026-08-01', heure: '10:00' },
  ];

  it('groups creneaux by departement, only for selected departements, in canonical order', () => {
    const groups = filterAndGroup(creneaux, ['091', '078']);
    expect(groups.map((g) => g.departement)).toEqual(['078', '091']);
  });

  it('sorts each group by date then heure ascending', () => {
    const groups = filterAndGroup(creneaux, ['078']);
    expect(groups[0].creneaux.map((c) => c.centre)).toEqual(['Centre B', 'Centre A']);
  });

  it('excludes departements with no matching creneaux', () => {
    const groups = filterAndGroup(creneaux, ['078', '093']);
    expect(groups.map((g) => g.departement)).toEqual(['078']);
  });

  it('returns an empty array when selected is empty', () => {
    expect(filterAndGroup(creneaux, [])).toEqual([]);
  });
});

describe('buildFilterHref', () => {
  it('adds the departement when it is not currently selected', () => {
    expect(buildFilterHref(['078'], '091')).toBe('?dep=078,091');
  });

  it('removes the departement when it is currently selected', () => {
    expect(buildFilterHref(['078', '091'], '078')).toBe('?dep=091');
  });

  it('returns a bare "?" when removing the last selected departement', () => {
    expect(buildFilterHref(['078'], '078')).toBe('?');
  });
});

describe('formatHeure', () => {
  it('replaces the colon with "h"', () => {
    expect(formatHeure('14:30')).toBe('14h30');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd web
npm test -- creneaux
```

Expected: FAIL — `Cannot find module './creneaux'` (the file doesn't exist yet).

- [ ] **Step 3: Write the implementation**

Create `web/lib/creneaux.ts`:

```typescript
// web/lib/creneaux.ts
import type { Creneau } from './state';

// Duplicated from worker/src/config.ts: web/ and worker/ are separate
// deployments with no shared package, so this list has to be kept in sync
// by hand if it ever changes on the worker side.
export const DEPARTEMENTS = [
  '078', '091', '092', '093', '094', '095', '027', '028', '060', '045',
];

export interface CreneauGroupData {
  departement: string;
  creneaux: Creneau[];
}

export function parseSelectedDepartements(depParam: string | undefined): string[] {
  if (!depParam) {
    return [...DEPARTEMENTS];
  }
  const requested = new Set(
    depParam.split(',').map((d) => d.trim()).filter(Boolean)
  );
  return DEPARTEMENTS.filter((d) => requested.has(d));
}

export function filterAndGroup(
  creneaux: Creneau[],
  selected: string[]
): CreneauGroupData[] {
  const selectedSet = new Set(selected);
  return DEPARTEMENTS.filter((d) => selectedSet.has(d))
    .map((departement) => ({
      departement,
      creneaux: creneaux
        .filter((c) => c.departement === departement)
        .sort((a, b) =>
          a.date === b.date ? a.heure.localeCompare(b.heure) : a.date.localeCompare(b.date)
        ),
    }))
    .filter((group) => group.creneaux.length > 0);
}

export function buildFilterHref(selected: string[], departement: string): string {
  const next = selected.includes(departement)
    ? selected.filter((d) => d !== departement)
    : [...selected, departement];
  return next.length === 0 ? '?' : `?dep=${next.join(',')}`;
}

export function formatHeure(heure: string): string {
  return heure.replace(':', 'h');
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- creneaux
```

Expected: PASS, all 10 tests green.

- [ ] **Step 5: Typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add web/lib/creneaux.ts web/lib/creneaux.test.ts
git commit -m "feat(web): add pure filter/group/sort logic for creneaux by departement"
```

---

## Task 3: `components/DepartementFilter.tsx`

**Files:**
- Create: `web/components/DepartementFilter.tsx`

**Interfaces:**
- Consumes: `DEPARTEMENTS`, `buildFilterHref` from `@/lib/creneaux` (Task 2); `Badge` from `@/components/ui/badge` (Task 1).
- Produces: `DepartementFilter({ selected: string[] })` — a React component, consumed by Task 5.

- [ ] **Step 1: Write the component**

Create `web/components/DepartementFilter.tsx`:

```tsx
// web/components/DepartementFilter.tsx
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { DEPARTEMENTS, buildFilterHref } from '@/lib/creneaux';

export function DepartementFilter({ selected }: { selected: string[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {DEPARTEMENTS.map((departement) => {
        const isSelected = selected.includes(departement);
        return (
          <Link key={departement} href={buildFilterHref(selected, departement)}>
            <Badge variant={isSelected ? 'default' : 'outline'} className="cursor-pointer">
              {departement}
            </Badge>
          </Link>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
cd web
npm run typecheck
```

Expected: no errors. (No unit test for this component — pure presentation, no branching logic beyond what `buildFilterHref` already covers in Task 2's tests.)

- [ ] **Step 3: Commit**

```bash
git add web/components/DepartementFilter.tsx
git commit -m "feat(web): add DepartementFilter chip bar component"
```

---

## Task 4: `components/CreneauGroup.tsx`

**Files:**
- Create: `web/components/CreneauGroup.tsx`

**Interfaces:**
- Consumes: `CreneauGroupData` type, `formatHeure` from `@/lib/creneaux` (Task 2); `Table`/`TableHeader`/`TableBody`/`TableRow`/`TableHead`/`TableCell` from `@/components/ui/table` (Task 1).
- Produces: `CreneauGroup({ group: CreneauGroupData })` — a React component, consumed by Task 5.

- [ ] **Step 1: Write the component**

Create `web/components/CreneauGroup.tsx`:

```tsx
// web/components/CreneauGroup.tsx
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatHeure, type CreneauGroupData } from '@/lib/creneaux';

export function CreneauGroup({ group }: { group: CreneauGroupData }) {
  return (
    <section className="mb-8">
      <h2 className="mb-2 text-lg font-semibold">
        {group.departement} · {group.creneaux.length} créneau
        {group.creneaux.length > 1 ? 'x' : ''}
      </h2>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Centre</TableHead>
            <TableHead>Date</TableHead>
            <TableHead>Heure</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {group.creneaux.map((c, i) => (
            <TableRow key={`${c.centre}-${c.date}-${c.heure}-${i}`}>
              <TableCell>{c.centre}</TableCell>
              <TableCell>{new Date(`${c.date}T00:00:00`).toLocaleDateString('fr-FR')}</TableCell>
              <TableCell>{formatHeure(c.heure)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </section>
  );
}
```

Note: the `Département` column from the old table is dropped here — it's now redundant with the section heading each group already has.

- [ ] **Step 2: Typecheck**

```bash
cd web
npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add web/components/CreneauGroup.tsx
git commit -m "feat(web): add CreneauGroup table-per-departement component"
```

---

## Task 5: Rewrite `app/page.tsx`, add `app/error.tsx`

**Files:**
- Modify: `web/app/page.tsx`
- Create: `web/app/error.tsx`

**Interfaces:**
- Consumes: `getLatestState` from `@/lib/state` (existing, unchanged); `parseSelectedDepartements`, `filterAndGroup` from `@/lib/creneaux` (Task 2); `DepartementFilter` (Task 3); `CreneauGroup` (Task 4); `Button` from `@/components/ui/button` (Task 1).

- [ ] **Step 1: Rewrite the page**

Replace the contents of `web/app/page.tsx`:

```tsx
import { getLatestState } from '@/lib/state';
import { parseSelectedDepartements, filterAndGroup } from '@/lib/creneaux';
import { DepartementFilter } from '@/components/DepartementFilter';
import { CreneauGroup } from '@/components/CreneauGroup';

export const revalidate = 120;

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ dep?: string }>;
}) {
  const { dep } = await searchParams;
  const selected = parseSelectedDepartements(dep);

  const state = await getLatestState();
  const creneaux = state?.creneaux ?? [];
  const lastChecked = state?.lastChecked;
  const groups = filterAndGroup(creneaux, selected);

  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="mb-1 text-2xl font-bold">RdvPermis-IDF — Créneaux disponibles</h1>
      <p className="mb-4 text-sm text-muted-foreground">
        Dernière vérification :{' '}
        {lastChecked
          ? new Date(lastChecked).toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })
          : 'jamais'}
      </p>
      <DepartementFilter selected={selected} />
      <div className="mt-6">
        {groups.length === 0 ? (
          <p className="text-muted-foreground">Aucun créneau disponible pour le moment.</p>
        ) : (
          groups.map((group) => <CreneauGroup key={group.departement} group={group} />)
        )}
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Add the error boundary**

Create `web/app/error.tsx`:

```tsx
'use client';

import { Button } from '@/components/ui/button';

export default function Error({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="mb-2 text-2xl font-bold">RdvPermis-IDF</h1>
      <p className="mb-4 text-muted-foreground">
        Impossible de charger les créneaux pour le moment, réessaie dans quelques instants.
      </p>
      <Button onClick={reset}>Réessayer</Button>
    </main>
  );
}
```

- [ ] **Step 3: Run the full test suite and typecheck**

```bash
cd web
npm test
npm run typecheck
```

Expected: all tests pass (including the untouched `lib/state.test.ts` and the new `lib/creneaux.test.ts`), no type errors.

- [ ] **Step 4: Build and manually verify**

```bash
npm run build
npm run dev
```

Open `http://localhost:3000` and check:
- All 10 department chips render, all selected (filled) by default.
- Clicking a chip toggles it and updates the URL (`?dep=...`), and the corresponding group appears/disappears.
- Groups are ordered `078, 091, 092, 093, 094, 095, 027, 028, 060, 045` (canonical order), each sorted by date then heure.
- With zero créneaux (or all departments deselected), the "Aucun créneau disponible pour le moment." message shows.
- To check the error state: temporarily set `BLOB_READ_WRITE_TOKEN` to an invalid value in `web/.env.local`, reload, confirm the friendly error message + "Réessayer" button render instead of a crash — then restore the correct token.

- [ ] **Step 5: Commit**

```bash
git add web/app/page.tsx web/app/error.tsx
git commit -m "feat(web): wire up department filter and grouped display on the dashboard"
```

- [ ] **Step 6: Push and confirm the Vercel git integration deploys it**

```bash
git push origin main
```

Then check that a new Vercel deployment for the `web` project auto-triggers and reaches `READY` (e.g. via `vercel ls` or the Vercel dashboard).
