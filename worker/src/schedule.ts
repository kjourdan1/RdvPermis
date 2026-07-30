import {
  PEAK_WINDOWS,
  PEAK_CHECK_INTERVAL_MINUTES,
  OFF_PEAK_CHECK_INTERVAL_MINUTES,
} from './config';

export function isPeakWindow(now: Date): boolean {
  const parisHour = Number(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Paris',
      hour: 'numeric',
      hourCycle: 'h23',
    }).format(now)
  );
  return PEAK_WINDOWS.some(
    (window) => parisHour >= window.startHour && parisHour < window.endHour
  );
}

export function shouldRunCheck(lastChecked: string | null, now: Date): boolean {
  if (lastChecked === null) {
    return true;
  }
  const elapsedMinutes = (now.getTime() - new Date(lastChecked).getTime()) / (1000 * 60);
  const thresholdMinutes = isPeakWindow(now)
    ? PEAK_CHECK_INTERVAL_MINUTES
    : OFF_PEAK_CHECK_INTERVAL_MINUTES;
  return elapsedMinutes >= thresholdMinutes;
}
