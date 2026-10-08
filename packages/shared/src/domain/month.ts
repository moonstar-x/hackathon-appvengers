import { TIME_ZONE, LOCALE } from '../constants';
export function monthKeyOf(date: Date | string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(new Date(date));
  return (
    (parts.find((p) => p.type === 'year')?.value ?? '') +
    '-' +
    (parts.find((p) => p.type === 'month')?.value ?? '')
  );
}
export function addMonths(key: string, n: number) {
  const [y = 0, m = 0] = key.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}
export function previousMonthKey(key: string) {
  return addMonths(key, -1);
}
export function monthBounds(key: string) {
  return {
    start: new Date(key + '-01T00:00:00-05:00'),
    end: new Date(new Date(addMonths(key, 1) + '-01T00:00:00-05:00').getTime() - 1),
  };
}
export function daysLeftInMonth(now: Date) {
  return Math.ceil((monthBounds(monthKeyOf(now)).end.getTime() + 1 - now.getTime()) / 86_400_000);
}
export function monthLabel(key: string) {
  return new Intl.DateTimeFormat(LOCALE, { timeZone: TIME_ZONE, month: 'long', year: 'numeric' })
    .format(monthBounds(key).start)
    .replace(' de ', ' ');
}
