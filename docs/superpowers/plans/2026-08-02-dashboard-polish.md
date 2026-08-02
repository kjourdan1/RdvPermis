# Dashboard Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Réserver mon examen" link to the official reservation flow, lighten the dashboard header to reduce how much blue it uses, and make the department picker open like a real dropdown on focus instead of only after typing.

**Architecture:** Both tasks are presentational-only changes to existing `web/` files — no new data flow, no new library, no worker changes. Task 1 restyles `app/page.tsx`'s header and adds the reservation link. Task 2 evolves the already-built `DepartementPicker.tsx` (adds an open/closed state driven by focus, keeps every existing piece of selection logic unchanged).

**Tech Stack:** Next.js 15 (App Router, existing), shadcn/ui + Tailwind CSS (existing), `lucide-react` (already an installed dependency, unused until now).

**Spec:** `docs/superpowers/specs/2026-08-02-dashboard-polish-design.md`

## Global Constraints

- No official government logos (Marianne, "GOUVERNEMENT", "Sécurité routière") — style only
  (light background, bold black title, gray subtitle, blue reserved for accents), per an explicit
  user decision driven by the existing "non affilié" disclaimer.
- One reservation button, global, near the top of the page — not one per department group.
- No worker changes. No new dependency beyond `lucide-react`, which is already installed.
- `DepartementPicker.tsx`'s existing selection logic (`buildFilterHref`, `foldForSearch`, the
  `allSelected` branch) must not change behavior — only when the option list is shown changes.

---

## Task 1: Reservation button + lighter header

**Files:**
- Modify: `web/app/page.tsx`

**Interfaces:**
- Consumes: `buttonVariants` from `@/components/ui/button` (existing, exported alongside
  `Button`); `cn` from `@/lib/utils` (existing).

- [ ] **Step 1: Replace the page**

Replace the contents of `web/app/page.tsx`:

```tsx
import Link from 'next/link';
import { getLatestState } from '@/lib/state';
import { parseSelectedDepartements, filterAndGroup } from '@/lib/creneaux';
import { DepartementPicker } from '@/components/DepartementPicker';
import { CreneauGroup } from '@/components/CreneauGroup';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

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
  const totalSlotsShown = groups.reduce((sum, g) => sum + g.creneaux.length, 0);

  return (
    <>
      <div className="h-1 w-full bg-gradient-to-r from-primary via-white to-destructive" />
      <header className="border-b border-border bg-card px-4 pb-4 pt-5">
        <div className="mx-auto flex max-w-3xl items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-secondary text-sm font-bold text-primary">
              RP
            </div>
            <div>
              <h1 className="text-base font-bold leading-tight text-foreground">RdvPermis</h1>
              <p className="text-xs text-muted-foreground">
                Suivi des places d&apos;examen du permis de conduire
              </p>
            </div>
          </div>
          <Link
            href="https://github.com/kjourdan1/RdvPermis"
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 whitespace-nowrap rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          >
            GitHub ↗
          </Link>
        </div>
        <div className="mx-auto mt-3 max-w-3xl rounded-md border border-border bg-muted p-2.5 text-[11.5px] leading-relaxed text-muted-foreground">
          Projet communautaire indépendant, non affilié à l&apos;État ni à l&apos;ANTS.
        </div>
      </header>

      <main className="mx-auto max-w-3xl p-6">
        <Link
          href="https://candidat.permisdeconduire.gouv.fr/reservation"
          target="_blank"
          rel="noopener noreferrer"
          className={cn(buttonVariants({ size: 'lg' }), 'mb-6 w-full')}
        >
          Réserver mon examen ↗
        </Link>

        <div className="mb-6 grid grid-cols-2 gap-3">
          <div className="rounded-lg border border-border bg-card p-3 shadow-sm">
            <div className="text-2xl font-bold text-primary">{totalSlotsShown}</div>
            <div className="mt-1 text-xs text-muted-foreground">Places trouvées</div>
          </div>
          <div className="rounded-lg border border-border bg-card p-3 shadow-sm">
            <div className="text-2xl font-bold text-primary">{selected.length}</div>
            <div className="mt-1 text-xs text-muted-foreground">Départements sélectionnés</div>
          </div>
        </div>

        <section className="mb-6 rounded-lg border border-border bg-card p-3.5 shadow-sm">
          <h2 className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Départements à afficher
          </h2>
          <DepartementPicker selected={selected} />
          <p className="mt-3 text-xs text-muted-foreground">
            Dernière vérification :{' '}
            {lastChecked
              ? new Date(lastChecked).toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })
              : 'jamais'}
          </p>
        </section>

        {creneaux.length === 0 ? (
          <p className="text-muted-foreground">Aucun créneau disponible pour le moment.</p>
        ) : groups.length === 0 ? (
          <p className="text-muted-foreground">Aucun créneau pour les départements sélectionnés.</p>
        ) : (
          groups.map((group) => <CreneauGroup key={group.departement} group={group} />)
        )}
      </main>

      <footer className="mx-auto max-w-3xl px-4 pb-6 text-[11.5px] leading-relaxed text-muted-foreground">
        Code source et configuration du bot sur{' '}
        <Link
          href="https://github.com/kjourdan1/RdvPermis"
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary hover:underline"
        >
          github.com/kjourdan1/RdvPermis
        </Link>
        . Pour réserver un créneau réel, rendez-vous sur votre espace candidat officiel du permis
        de conduire.
      </footer>
    </>
  );
}
```

What changed vs. the current file: the `<header>` background/text tokens (`bg-primary
text-primary-foreground` → `border-b border-border bg-card`, with `text-foreground`/
`text-muted-foreground` on the title/subtitle instead of `text-primary-foreground`/
`text-primary-foreground/70`), the monogram (dropped the blue gradient for a flat
`bg-secondary text-primary`), the GitHub link and disclaimer banner (dropped the
`primary-foreground/*` variants for `border-border`/`text-muted-foreground`/`bg-muted`), and a
new reservation `<Link>` styled as a `Button` at the top of `<main>`. The stats cards, the
`DepartementPicker` section, the créneaux list, and the footer are unchanged.

- [ ] **Step 2: Typecheck and run the full test suite**

```bash
cd web
npm run typecheck
npm test
```

Expected: no errors, all existing tests still pass (this task touches no test-covered logic).

- [ ] **Step 3: Manually verify**

```bash
npm run dev
```

Open `http://localhost:3000` and check:
- Header background is light (not solid blue), title "RdvPermis" is bold black, subtitle is gray.
- A "Réserver mon examen ↗" button renders full-width, above the stat cards, styled with the
  primary blue button color; clicking it (or checking its `href` in devtools) points to
  `https://candidat.permisdeconduire.gouv.fr/reservation` and opens in a new tab.
- The disclaimer banner and GitHub link are still legible, now on the light header background.
- Stat card numbers and other accents are still blue — only the header's solid background
  changed.

**Known environment constraint**: this sandbox redacts secret-shaped values (like
`BLOB_READ_WRITE_TOKEN`) before they reach disk, so `npm run dev`/`npm run build`-and-serve may
hit the Blob error boundary here instead of showing real data — a prior, already-diagnosed
limitation. If you hit this, the header/button are visible regardless of créneaux data (they
render above the data-dependent section), so you can still verify them; note in your report if
you saw the error boundary instead of real data and confirm the header/button rendered anyway.

- [ ] **Step 4: Commit**

```bash
git add web/app/page.tsx
git commit -m "feat(web): add reservation button, lighten the header"
```

---

## Task 2: `DepartementPicker.tsx` opens like a dropdown

**Files:**
- Modify: `web/components/DepartementPicker.tsx`

**Interfaces:**
- Consumes: `ChevronDown` from `lucide-react` (new import, already an installed dependency).
- Produces: `DepartementPicker({ selected: string[] })` — same signature as today, no change to
  how `app/page.tsx` uses it.

- [ ] **Step 1: Replace the component**

Replace the contents of `web/components/DepartementPicker.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { DEPARTEMENTS, foldForSearch } from '@/lib/departements';
import { buildFilterHref } from '@/lib/creneaux';

const SEARCH_INDEX = DEPARTEMENTS.map((d) => ({
  ...d,
  haystack: `${foldForSearch(d.name)} ${d.code.toLowerCase()}`,
}));

export function DepartementPicker({ selected }: { selected: string[] }) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);

  const selectedSet = new Set(selected);
  const allSelected = selected.length === DEPARTEMENTS.length;
  const selectedInfo = DEPARTEMENTS.filter((d) => selectedSet.has(d.code));

  const trimmedQuery = foldForSearch(query.trim());
  const options = SEARCH_INDEX.filter(
    (d) =>
      (allSelected || !selectedSet.has(d.code)) &&
      (trimmedQuery === '' || d.haystack.includes(trimmedQuery))
  );

  function toggle(code: string) {
    if (allSelected) {
      router.push(`?dep=${code}`);
    } else {
      router.push(buildFilterHref(selected, code));
    }
    setQuery('');
    setIsOpen(false);
  }

  return (
    <div className="space-y-3">
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setIsOpen(true)}
          onBlur={() => setTimeout(() => setIsOpen(false), 150)}
          placeholder="Ajouter un département (ex : Rhône, 69, Paris)"
          aria-label="Rechercher un département"
          autoComplete="off"
          className="w-full rounded-md border border-input bg-background px-3 py-2 pr-8 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
        <ChevronDown
          aria-hidden="true"
          className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        />
        {isOpen && options.length > 0 && (
          <div className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-md border border-border bg-popover shadow-md">
            {options.map((d) => (
              <button
                key={d.code}
                type="button"
                onClick={() => toggle(d.code)}
                className="block w-full px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground"
              >
                <span className="mr-1.5 text-muted-foreground">{d.code}</span>
                {d.name}
              </button>
            ))}
          </div>
        )}
      </div>
      {allSelected ? (
        <p className="text-sm text-muted-foreground">
          Tous les départements ({DEPARTEMENTS.length}) — recherchez-en un pour n&apos;afficher
          que celui-là.
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {selectedInfo.map((d) => (
            <Badge key={d.code} variant="secondary" className="gap-1 pr-1">
              {d.name} ({d.code})
              <button
                type="button"
                onClick={() => toggle(d.code)}
                aria-label={`Retirer ${d.name}`}
                className="ml-1 rounded-full hover:bg-primary/20"
              >
                ×
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
```

What changed vs. the current file: added `isOpen` state, set on focus and cleared (after a
150ms delay, so a suggestion click registers first) on blur and on selection; the dropdown panel
now shows whenever `isOpen && options.length > 0`, regardless of whether a query has been typed
(previously it only showed once `trimmedQuery !== ''`); the `slice(0, 8)` cap on the option list
is removed (the scrollable container already handles a long list); a `ChevronDown` icon from
`lucide-react` is added inside the input to signal it opens a list. The selection logic itself —
`buildFilterHref`, `foldForSearch`, the `allSelected` branch, the chip rendering — is otherwise
byte-identical to before.

- [ ] **Step 2: Typecheck and run the full test suite**

```bash
cd web
npm run typecheck
npm test
```

Expected: no errors, all existing tests still pass (this component has no dedicated test, per
the established pattern for this project's Client Components, and this task doesn't touch
`departements.ts`/`creneaux.ts`, which are what's actually tested).

- [ ] **Step 3: Manually verify**

```bash
npm run dev
```

Open `http://localhost:3000` and check:
- Clicking/focusing the search input immediately shows a dropdown list (not just after typing).
- Typing filters that list, with accents folded (e.g. typing "rhone" still finds "Rhône").
- Clicking an option adds it (or, if starting from the all-selected default, narrows to just
  that department) and closes the dropdown.
- Clicking outside the input closes the dropdown.
- A small chevron icon is visible on the right side of the input.

If you cannot open a browser/visual tool in this environment, use the same fixture-render
approach used for a similar earlier task in this project: a throwaway script that renders the
real, already-committed `DepartementPicker` component via `react-dom/server` with `isOpen`
forced open (temporarily, in the throwaway script only, not in the committed component) against
a couple of `selected` fixtures, to confirm the option list and chevron render as expected —
delete the script afterward, don't commit it. Note in your report which method you used.

- [ ] **Step 4: Commit**

```bash
git add web/components/DepartementPicker.tsx
git commit -m "feat(web): open DepartementPicker's option list on focus, like a dropdown"
```
