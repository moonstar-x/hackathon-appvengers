import type { MonthlyProgress, StreakDefinition, ProgressSummary } from '../tenants/types';
import { monthLabel, daysLeftInMonth, monthKeyOf } from './month';
import { tierForTotal, nextTier } from './tiers';
import { tierStreakStatus, progressInCycle } from './streaks';
export function buildProgressSummary(
  def: StreakDefinition,
  history: MonthlyProgress[],
  month: string,
  now: Date,
): ProgressSummary {
  const item = history.find((h) => h.monthKey === month);
  const total = item?.totalCents ?? 0;
  const current = tierForTotal(def, total);
  const next = nextTier(def, total);
  const totals = Object.fromEntries(history.map((h) => [h.monthKey, h.totalCents]));
  return {
    streakId: def.streakId,
    streakName: def.name,
    monthKey: month,
    monthLabel: monthLabel(month),
    daysLeftInMonth: month === monthKeyOf(now) ? daysLeftInMonth(now) : 0,
    totalCents: total,
    purchaseCount: item?.purchaseCount ?? 0,
    currentTier: current ? { tierId: current.tierId, name: current.name } : null,
    nextTier: next
      ? {
          tierId: next.tier.tierId,
          name: next.tier.name,
          minMonthlyCents: next.tier.minMonthlyCents,
          gapCents: next.gapCents,
          receiptTeaser: next.tier.receiptTeaser,
        }
      : null,
    tiers: def.tiers.map((tier) => {
      const streak = tierStreakStatus(tier, month, totals);
      const reachedThisMonth = total >= tier.minMonthlyCents;
      return {
        tierId: tier.tierId,
        name: tier.name,
        minMonthlyCents: tier.minMonthlyCents,
        reachedThisMonth,
        streak,
        rewards: tier.rewards.map((r) => ({
          ...r,
          progressInCycle: progressInCycle(
            streak.consecutiveMonths,
            r.requiredConsecutiveMonths,
            reachedThisMonth,
          ),
          unlockedThisMonth:
            reachedThisMonth &&
            streak.consecutiveMonths > 0 &&
            streak.consecutiveMonths % r.requiredConsecutiveMonths === 0,
        })),
      };
    }),
    businessesVisited: item?.businessesVisited ?? [],
    message: '',
  };
}
