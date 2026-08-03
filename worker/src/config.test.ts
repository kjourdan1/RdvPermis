import { describe, it, expect } from 'vitest';
import {
  DEPARTEMENTS,
  PEAK_WINDOWS,
  PEAK_CHECK_INTERVAL_MINUTES,
  OFF_PEAK_CHECK_INTERVAL_MINUTES,
} from './config';

describe('config', () => {
  it('lists the 16 Ile-de-France + neighboring departements as zero-padded, 3-character codes with no duplicates', () => {
    expect(DEPARTEMENTS).toHaveLength(16);
    expect(new Set(DEPARTEMENTS).size).toBe(16);
    expect(DEPARTEMENTS.every((d) => d.length === 3)).toBe(true);
  });

  it('includes all 8 Ile-de-France departements and their 8 bordering departements', () => {
    for (const dep of [
      '075', '077', '078', '091', '092', '093', '094', '095',
      '002', '010', '027', '028', '045', '051', '060', '089',
    ]) {
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

  it('sets a 15 min peak interval and 60 min off-peak interval', () => {
    expect(PEAK_CHECK_INTERVAL_MINUTES).toBe(15);
    expect(OFF_PEAK_CHECK_INTERVAL_MINUTES).toBe(60);
  });
});
