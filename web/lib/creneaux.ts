// web/lib/creneaux.ts
import type { Creneau } from './state';
import { DEPARTEMENTS as DEPARTEMENTS_INFO } from './departements';

export const DEPARTEMENTS = DEPARTEMENTS_INFO.map((d) => d.code);

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
