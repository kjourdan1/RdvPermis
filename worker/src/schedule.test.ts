import { describe, it, expect } from 'vitest';
import { isPeakWindow, shouldRunCheck } from './schedule';

describe('isPeakWindow', () => {
  it('is true inside a peak window in winter (CET, UTC+1)', () => {
    // 2026-01-15T07:30:00Z = 08:30 Paris (CET)
    expect(isPeakWindow(new Date('2026-01-15T07:30:00Z'))).toBe(true);
  });

  it('is false outside any peak window in winter', () => {
    // 2026-01-15T09:30:00Z = 10:30 Paris (CET)
    expect(isPeakWindow(new Date('2026-01-15T09:30:00Z'))).toBe(false);
  });

  it('is true inside a peak window in summer (CEST, UTC+2), proving DST is handled', () => {
    // 2026-07-15T06:30:00Z = 08:30 Paris (CEST)
    expect(isPeakWindow(new Date('2026-07-15T06:30:00Z'))).toBe(true);
  });

  it('treats the window start as inclusive and the end as exclusive', () => {
    // 2026-01-15T07:00:00Z = 08:00 Paris -> inside [8,9)
    expect(isPeakWindow(new Date('2026-01-15T07:00:00Z'))).toBe(true);
    // 2026-01-15T08:00:00Z = 09:00 Paris -> outside [8,9)
    expect(isPeakWindow(new Date('2026-01-15T08:00:00Z'))).toBe(false);
  });
});

describe('shouldRunCheck', () => {
  it('returns true when there is no previous check', () => {
    expect(shouldRunCheck(null, new Date('2026-01-15T10:00:00Z'))).toBe(true);
  });

  it('returns false in a peak window when less than 5 min have elapsed', () => {
    // now = 08:30 Paris (peak), lastChecked = 08:27 Paris -> 3 min elapsed
    const lastChecked = '2026-01-15T07:27:00Z';
    const now = new Date('2026-01-15T07:30:00Z');
    expect(shouldRunCheck(lastChecked, now)).toBe(false);
  });

  it('returns true in a peak window when at least 5 min have elapsed', () => {
    // now = 08:30 Paris (peak), lastChecked = 08:25 Paris -> 5 min elapsed
    const lastChecked = '2026-01-15T07:25:00Z';
    const now = new Date('2026-01-15T07:30:00Z');
    expect(shouldRunCheck(lastChecked, now)).toBe(true);
  });

  it('returns false off-peak when less than 15 min have elapsed', () => {
    // now = 10:30 Paris (off-peak), lastChecked = 10:20 Paris -> 10 min elapsed
    const lastChecked = '2026-01-15T09:20:00Z';
    const now = new Date('2026-01-15T09:30:00Z');
    expect(shouldRunCheck(lastChecked, now)).toBe(false);
  });

  it('returns true off-peak when at least 15 min have elapsed, even at irregular minute marks', () => {
    // The exact scenario that motivated this design: last real check at
    // 14:43 Paris, current run lands at 15:47 Paris (neither is a clean
    // :00/:30 mark, but 64 min have genuinely elapsed and both are off-peak
    // -- hour 14 is off-peak under the new windows since [11,14) excludes 14).
    const lastChecked = '2026-01-15T13:43:00Z'; // 14:43 Paris
    const now = new Date('2026-01-15T14:47:00Z'); // 15:47 Paris
    expect(shouldRunCheck(lastChecked, now)).toBe(true);
  });
});
