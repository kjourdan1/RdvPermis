import { describe, it, expect } from 'vitest';
import { DEPARTEMENTS, IDF_ET_VOISINS, foldForSearch } from './departements';

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

describe('foldForSearch', () => {
  it('strips accents and lowercases', () => {
    expect(foldForSearch('Rhône')).toBe('rhone');
    expect(foldForSearch("Côte-d'Or")).toBe("cote-d'or");
  });

  it('produces an unaccented, lowercase haystack for every department name', () => {
    expect(DEPARTEMENTS.every((d) => /^[a-z0-9 '-]+$/.test(foldForSearch(d.name)))).toBe(true);
  });
});

describe('IDF_ET_VOISINS', () => {
  it('has exactly 16 entries with no duplicates', () => {
    expect(IDF_ET_VOISINS).toHaveLength(16);
    expect(new Set(IDF_ET_VOISINS).size).toBe(16);
  });

  it('is a subset of known department codes', () => {
    const knownCodes = new Set(DEPARTEMENTS.map((d) => d.code));
    expect(IDF_ET_VOISINS.every((code) => knownCodes.has(code))).toBe(true);
  });

  it('includes all 8 Île-de-France departments', () => {
    const idf = ['075', '077', '078', '091', '092', '093', '094', '095'];
    expect(idf.every((code) => IDF_ET_VOISINS.includes(code))).toBe(true);
  });

  it('includes the 8 bordering departments', () => {
    const bordering = ['002', '010', '027', '028', '045', '051', '060', '089'];
    expect(bordering.every((code) => IDF_ET_VOISINS.includes(code))).toBe(true);
  });
});
