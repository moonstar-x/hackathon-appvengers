import type {
  StreakDefinition,
  MonthlyTotals,
  TierDefinition,
  RewardDefinition,
  CustomerReward,
  CustomerRewardDto,
} from '../tenants/types';
import { streakCount } from './streaks';
import { addMonths, monthBounds } from './month';
export function dueRewards(def: StreakDefinition, totals: MonthlyTotals, month: string) {
  return def.tiers.flatMap((tier) => {
    const c = streakCount(tier, month, totals);
    return tier.rewards
      .filter((r) => c > 0 && c % r.requiredConsecutiveMonths === 0)
      .map((reward) => ({ tier, reward }));
  });
}
export function generateRewardCode(prefix: string, randomInt: (max: number) => number) {
  const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  return prefix + '-' + Array.from({ length: 8 }, () => alphabet[randomInt(32)]).join('');
}
export function buildRewardInstances(input: {
  ci: string;
  streakId: string;
  month: string;
  tier: TierDefinition;
  reward: RewardDefinition;
  now: Date;
  purchaseId: string;
}): Omit<CustomerReward, 'code'>[] {
  const { ci, streakId, month, tier, reward, now, purchaseId } = input;
  const base = {
    ci,
    streakId,
    monthKey: month,
    tierId: tier.tierId,
    rewardId: reward.rewardId,
    issuedAt: now.toISOString(),
    issuedByPurchaseId: purchaseId,
  };
  const id = `${streakId}#${month}#${tier.tierId}#${reward.rewardId}`;
  if (reward.selection === 'ONE_OF')
    return [
      {
        ...base,
        rewardInstanceId: id + '#choice',
        status: 'PENDING_CHOICE',
        options: reward.benefits,
        installment: 0,
        validFrom: now.toISOString(),
        expiresAt: monthBounds(addMonths(month, reward.validForMonths)).end.toISOString(),
      },
    ];
  return reward.benefits.flatMap((benefit) =>
    Array.from({ length: benefit.monthlyInstallments ?? 1 }, (_, i) => ({
      ...base,
      rewardInstanceId: `${id}#${benefit.benefitId}#${i}`,
      status: 'AVAILABLE' as const,
      benefit,
      installment: i,
      validFrom:
        i === 0 ? now.toISOString() : monthBounds(addMonths(month, 1 + i)).start.toISOString(),
      expiresAt: monthBounds(
        addMonths(month, (benefit.monthlyInstallments ?? 1) > 1 ? 1 + i : reward.validForMonths),
      ).end.toISOString(),
    })),
  );
}
export function rewardDto(r: CustomerReward, now: Date): CustomerRewardDto {
  return {
    code: r.code,
    status:
      r.status !== 'REDEEMED' && now.getTime() > new Date(r.expiresAt).getTime()
        ? 'EXPIRED'
        : r.status,
    tierId: r.tierId,
    tierName: { BRONZE: 'Bronce', SILVER: 'Plata', GOLD: 'Oro' }[r.tierId],
    monthKey: r.monthKey,
    benefit: r.benefit,
    options: r.options,
    validFrom: r.validFrom,
    expiresAt: r.expiresAt,
    redeemedAt: r.redeemedAt,
  };
}
