import type { MonthlyTotals, TierDefinition } from '../tenants/types';
import { LOOKBACK_MONTHS } from '../constants';
import { addMonths } from './month';
export function streakCount(tier: TierDefinition, month: string, totals: MonthlyTotals) {
  let count = 0;
  while (count < LOOKBACK_MONTHS && (totals[addMonths(month, -count)] ?? 0) >= tier.minMonthlyCents)
    count++;
  return count;
}
export function tierStreakStatus(
  tier: TierDefinition,
  month: string,
  totals: MonthlyTotals,
): { status: 'ACTIVE' | 'AT_RISK' | 'NONE'; consecutiveMonths: number } {
  const c = streakCount(tier, month, totals);
  if (c > 0) return { status: 'ACTIVE', consecutiveMonths: c };
  const previous = streakCount(tier, addMonths(month, -1), totals);
  return previous > 0
    ? { status: 'AT_RISK', consecutiveMonths: previous }
    : { status: 'NONE', consecutiveMonths: 0 };
}
export function progressInCycle(c: number, n: number, reached: boolean) {
  return reached && c > 0 && c % n === 0 ? n : c % n;
}
