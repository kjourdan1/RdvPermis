import { describe, it, expect } from 'vitest';
import {
  DEPARTEMENTS,
  PEAK_WINDOWS,
  PEAK_CHECK_INTERVAL_MINUTES,
  OFF_PEAK_CHECK_INTERVAL_MINUTES,
} from './config';

describe('config', () => {
  it('lists all 101 French departements as zero-padded, 3-character codes with no duplicates', () => {
    expect(DEPARTEMENTS).toHaveLength(101);
    expect(new Set(DEPARTEMENTS).size).toBe(101);
    expect(DEPARTEMENTS.every((d) => d.length === 3)).toBe(true);
  });

  it('includes the original 10 Ile-de-France departements this project started with', () => {
    for (const dep of ['078', '091', '092', '093', '094', '095', '027', '028', '060', '045']) {
      expect(DEPARTEMENTS).toContain(dep);
    }
  });

  it('includes metropolitan edge cases: first and last numeric codes, and Corse', () => {
    expect(DEPARTEMENTS).toContain('001'); // Ain
    expect(DEPARTEMENTS).toContain('095'); // Val-d'Oise, last numeric metropolitan code
    expect(DEPARTEMENTS).toContain('02A'); // Corse-du-Sud
    expect(DEPARTEMENTS).toContain('02B'); // Haute-Corse
    expect(DEPARTEMENTS).not.toContain('020'); // "20" does not exist as a department -- split into 2A/2B
  });

  it('includes all five overseas departements', () => {
    for (const dep of ['971', '972', '973', '974', '976']) {
      expect(DEPARTEMENTS).toContain(dep);
    }
  });

  it('defines the three peak windows from the spec', () => {
    expect(PEAK_WINDOWS).toEqual([
      { startHour: 8, endHour: 9 },
      { startHour: 12, endHour: 13 },
      { startHour: 17, endHour: 18 },
    ]);
  });

  it('sets a 15 min peak interval and 30 min off-peak interval', () => {
    expect(PEAK_CHECK_INTERVAL_MINUTES).toBe(15);
    expect(OFF_PEAK_CHECK_INTERVAL_MINUTES).toBe(30);
  });
});
