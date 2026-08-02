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
