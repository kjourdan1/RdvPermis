import type { Creneau } from './types';

export function creneauKey(c: Creneau): string {
  return `${c.departement}|${c.centre}|${c.date}|${c.heure}`;
}

export function findNewCreneaux(previous: Creneau[], current: Creneau[]): Creneau[] {
  const previousKeys = new Set(previous.map(creneauKey));
  return current.filter((c) => !previousKeys.has(creneauKey(c)));
}
