// web/lib/creneaux.ts
import type { Creneau } from './state';

// Deliberate subset, not a live sync with worker/src/config.ts: the worker
// now checks all 101 French departements, but the dashboard's department
// picker still only knows this original set of 10 Ile-de-France codes.
// Expanding this list is out of scope here -- it's chantier 2 (see
// "Hors périmètre" in
// docs/superpowers/specs/2026-08-02-worker-national-departements-design.md),
// which also needs to add department names since bare codes aren't
// meaningful to pick from in a UI.
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
