import { describe, it, expect } from 'vitest';
import { DEPARTEMENTS } from './departements';

describe('DEPARTEMENTS', () => {
  it('has exactly 101 entries with no duplicate codes', () => {
    expect(DEPARTEMENTS).toHaveLength(101);
    expect(new Set(DEPARTEMENTS.map((d) => d.code)).size).toBe(101);
  });

  it('uses 3-character codes for every entry, matching the worker format', () => {
    expect(DEPARTEMENTS.every((d) => d.code.length === 3)).toBe(true);
  });

  it('gives every entry a non-empty name', () => {
    expect(DEPARTEMENTS.every((d) => d.name.trim().length > 0)).toBe(true);
  });

  it('spot-checks known codes across the list, including edge cases', () => {
    const byCode = Object.fromEntries(DEPARTEMENTS.map((d) => [d.code, d.name]));
    expect(byCode['001']).toBe('Ain');
    expect(byCode['075']).toBe('Paris');
    expect(byCode['078']).toBe('Yvelines');
    expect(byCode['095']).toBe("Val-d'Oise");
    expect(byCode['02A']).toBe('Corse-du-Sud');
    expect(byCode['02B']).toBe('Haute-Corse');
    expect(byCode['069']).toBe('Rhône');
    expect(byCode['090']).toBe('Territoire de Belfort');
    expect(byCode['971']).toBe('Guadeloupe');
    expect(byCode['976']).toBe('Mayotte');
  });
});
