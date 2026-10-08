import { LOCALE, CURRENCY } from '../constants';
export function formatMoney(cents: number) {
  if (!Number.isSafeInteger(cents)) throw new Error('El monto debe estar en centavos enteros');
  const parts = new Intl.NumberFormat(LOCALE, {
    style: 'currency',
    currency: CURRENCY,
    minimumFractionDigits: 2,
  }).formatToParts(cents / 100);
  // Keep the Ecuadorian grouping/decimal symbols and omit whole-dollar decimals.
  return parts
    .filter((p) => !(cents % 100 === 0 && (p.type === 'decimal' || p.type === 'fraction')))
    .map((p) => p.value)
    .join('')
    .replace(/\s/g, '');
}
export function dollarsToCents(input: string) {
  const value = input.trim();
  if (!/^\d+(?:[.,]\d{1,2})?$/.test(value)) throw new Error('Usa un monto como 18,50');
  const [whole = '0', frac = ''] = value.replace(',', '.').split('.');
  const cents = Number(whole) * 100 + Number(frac.padEnd(2, '0'));
  if (!Number.isSafeInteger(cents)) throw new Error('Monto fuera de rango');
  return cents;
}
