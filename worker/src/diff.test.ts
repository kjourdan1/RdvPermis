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
