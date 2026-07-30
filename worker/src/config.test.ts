import { describe, it, expect } from 'vitest';
import {
  DEPARTEMENTS,
  PEAK_WINDOWS,
  PEAK_CHECK_INTERVAL_MINUTES,
  OFF_PEAK_CHECK_INTERVAL_MINUTES,
} from './config';

describe('config', () => {
  it('lists all ten target departements as 3-digit zero-padded codes', () => {
    expect(DEPARTEMENTS).toEqual([
      '078', '091', '092', '093', '094', '095', '027', '028', '060', '045',
    ]);
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
