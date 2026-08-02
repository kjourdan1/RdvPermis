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
