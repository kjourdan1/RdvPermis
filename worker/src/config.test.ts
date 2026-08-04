import { describe, it, expect } from 'vitest';
import {
  DEPARTEMENTS,
  PEAK_WINDOWS,
  PEAK_CHECK_INTERVAL_MINUTES,
  OFF_PEAK_CHECK_INTERVAL_MINUTES,
} from './config';

describe('config', () => {
  it('lists the 4 filtered departements as zero-padded, 3-character codes with no duplicates', () => {
    expect(DEPARTEMENTS).toHaveLength(4);
    expect(new Set(DEPARTEMENTS).size).toBe(4);
    expect(DEPARTEMENTS.every((d) => d.length === 3)).toBe(true);
  });

  it('includes Eure, Eure-et-Loir, Seine-et-Marne, and Yvelines', () => {
    for (const dep of ['027', '028', '077', '078']) {
      expect(DEPARTEMENTS).toContain(dep);
    }
  });

  it('defines the three peak windows (8h-9h, 11h-14h, 16h-18h Paris time)', () => {
    expect(PEAK_WINDOWS).toEqual([
      { startHour: 8, endHour: 9 },
      { startHour: 11, endHour: 14 },
      { startHour: 16, endHour: 18 },
    ]);
  });

  it('sets a 5 min peak interval and 15 min off-peak interval', () => {
    expect(PEAK_CHECK_INTERVAL_MINUTES).toBe(5);
    expect(OFF_PEAK_CHECK_INTERVAL_MINUTES).toBe(15);
  });
});
