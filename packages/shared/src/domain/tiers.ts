import type { StreakDefinition, TierDefinition } from '../program/types';
export function tierForTotal(def: StreakDefinition, total: number) {
  return [...def.tiers].reverse().find((t) => total >= t.minMonthlyCents) ?? null;
}
export function nextTier(def: StreakDefinition, total: number) {
  const tier = def.tiers.find((t) => t.minMonthlyCents > total);
  return tier ? { tier, gapCents: tier.minMonthlyCents - total } : null;
}
export function compareTiers(a: TierDefinition, b: TierDefinition) {
  return a.minMonthlyCents - b.minMonthlyCents;
}
