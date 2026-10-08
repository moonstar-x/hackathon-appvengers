import { randomInt } from 'node:crypto';
import {
  dueRewards,
  buildRewardInstances,
  generateRewardCode,
  rewardDto,
  isDiscountBenefit,
  computeDiscount,
} from '@club/shared';
import type {
  ProgramConfig,
  CustomerReward,
  BenefitDefinition,
  CustomerRewardDto,
} from '@club/shared';
import type { Repositories } from '../repositories/types';
import type { ProgramService } from './program-service';
import type { Clock } from '../lib/clock';
import { AppError } from '../lib/errors';
export class RewardService {
  constructor(
    private readonly repo: Repositories,
    private readonly program: ProgramService,
    private readonly config: ProgramConfig,
    private readonly clock: Clock,
  ) {}
  async issue(ci: string, month: string, purchaseId: string, streakIds: string[]) {
    const { streaks } = await this.program.get();
    for (const def of streaks.filter((d) => streakIds.includes(d.streakId))) {
      const history = await this.repo.history(ci, def.streakId);
      const totals = Object.fromEntries(history.map((h) => [h.monthKey, h.totalCents]));
      const instances = dueRewards(def, totals, month).flatMap(({ tier, reward }) =>
        buildRewardInstances({
          ci,
          streakId: def.streakId,
          month,
          tier,
          reward,
          now: this.clock.now(),
          purchaseId,
        }),
      );
      await Promise.all(
        instances.map(async (instance) => {
          let code = generateRewardCode(this.config.rewardCodePrefix, randomInt);
          while (await this.repo.rewardByCode(code))
            code = generateRewardCode(this.config.rewardCodePrefix, randomInt);
          await this.repo.putReward({ ...instance, code });
        }),
      );
    }
    return (await this.repo.rewards(ci)).filter((r) => r.issuedByPurchaseId === purchaseId);
  }
  async wallet(ci: string) {
    const { streaks } = await this.program.get();
    return (await this.repo.rewards(ci))
      .sort((a, b) => b.issuedAt.localeCompare(a.issuedAt))
      .map((r) =>
        rewardDto(
          r,
          this.clock.now(),
          streaks.find((s) => s.streakId === r.streakId),
        ),
      );
  }
  async lookup(code: string) {
    const r = await this.repo.rewardByCode(code);
    if (!r) throw new AppError(404, 'REWARD_NOT_FOUND', 'No encontramos ese código');
    return r;
  }
  private async definition(r: CustomerReward) {
    return (await this.program.get()).streaks.find((s) => s.streakId === r.streakId);
  }
  private async cappedBenefit(r: CustomerReward, benefit: BenefitDefinition) {
    if (
      !['PERCENT_DISCOUNT', 'SPECIAL_DAYS_DISCOUNT'].includes(benefit.type) ||
      benefit.maxDiscountCents !== undefined
    )
      return benefit;
    const liga = await this.definition(r);
    const current = liga?.tiers
      .flatMap((t) => t.rewards)
      .find((d) => d.rewardId === r.rewardId)
      ?.benefits.find((b) => b.benefitId === benefit.benefitId);
    if (!current?.maxDiscountCents) throw new Error('invalid reward snapshot');
    return { ...benefit, maxDiscountCents: current.maxDiscountCents };
  }
  async preview(code: string, purchaseAmountCents?: number): Promise<CustomerRewardDto> {
    const r = await this.lookup(code);
    const liga = await this.definition(r);
    const benefit = r.benefit ? await this.cappedBenefit(r, r.benefit) : undefined;
    const options = r.options
      ? await Promise.all(r.options.map((b) => this.cappedBenefit(r, b)))
      : undefined;
    return {
      ...rewardDto({ ...r, benefit, options }, this.clock.now(), liga),
      ...(benefit && isDiscountBenefit(benefit) && purchaseAmountCents !== undefined
        ? { discount: computeDiscount(benefit, purchaseAmountCents) }
        : {}),
    };
  }
  private reject(reason: string, redeemableAt?: string[]): never {
    throw new AppError(409, 'REWARD_NOT_REDEEMABLE', 'La recompensa no se puede canjear', {
      reason,
      ...(redeemableAt ? { details: { redeemableAt } } : {}),
    });
  }
  private check(r: CustomerReward) {
    if (r.status === 'REDEEMED') this.reject('ALREADY_REDEEMED');
    if (this.clock.now().getTime() > new Date(r.expiresAt).getTime()) this.reject('EXPIRED');
    if (this.clock.now().getTime() < new Date(r.validFrom).getTime()) this.reject('NOT_YET_VALID');
  }
  private option(r: CustomerReward, id: string): BenefitDefinition {
    const b = r.options?.find((b) => b.benefitId === id);
    if (!b) throw new AppError(400, 'VALIDATION_ERROR', 'Elige una opción válida');
    return b;
  }
  async choose(ci: string, code: string, id: string) {
    const r = await this.lookup(code);
    if (r.ci !== ci) throw new AppError(404, 'REWARD_NOT_FOUND', 'No encontramos ese código');
    if (r.status !== 'PENDING_CHOICE')
      throw new AppError(409, 'REWARD_ALREADY_CHOSEN', 'Ya elegiste esta recompensa');
    this.check(r);
    const updated = {
      ...r,
      benefit: this.option(r, id),
      options: undefined,
      status: 'AVAILABLE' as const,
      chosenAt: this.clock.now().toISOString(),
    };
    if (!(await this.repo.updateReward(updated, 'PENDING_CHOICE')))
      throw new AppError(409, 'REWARD_ALREADY_CHOSEN', 'Ya elegiste esta recompensa');
    return rewardDto(updated, this.clock.now(), await this.definition(r));
  }
  async redeem(
    code: string,
    businessId: string,
    transactionId?: string,
    benefitId?: string,
    purchaseAmountCents?: number,
  ) {
    const r = await this.lookup(code);
    this.check(r);
    const selected =
      r.status === 'PENDING_CHOICE'
        ? benefitId
          ? this.option(r, benefitId)
          : this.reject('PENDING_CHOICE')
        : r.benefit;
    if (!selected) throw new Error('invalid reward snapshot');
    const liga = await this.definition(r);
    const redeemableAt = selected.businessIds ?? liga?.businessIds ?? [];
    if (!redeemableAt.includes(businessId)) this.reject('WRONG_BUSINESS', redeemableAt);
    if (isDiscountBenefit(selected) && purchaseAmountCents === undefined)
      throw new AppError(400, 'PURCHASE_AMOUNT_REQUIRED', 'Ingresa el monto de la compra');
    const benefit = await this.cappedBenefit(r, selected);
    const discount = isDiscountBenefit(benefit)
      ? computeDiscount(benefit, purchaseAmountCents ?? 0)
      : undefined;
    if (discount?.discountCents === 0) this.reject('PURCHASE_TOO_SMALL');
    const updated = {
      ...r,
      benefit,
      options: undefined,
      status: 'REDEEMED' as const,
      chosenAt:
        r.chosenAt ?? (r.status === 'PENDING_CHOICE' ? this.clock.now().toISOString() : undefined),
      redeemedAt: this.clock.now().toISOString(),
      redeemedAtBusinessId: businessId,
      redeemedTransactionId: transactionId,
      ...(discount
        ? {
            redeemedPurchaseAmountCents: discount.purchaseAmountCents,
            appliedDiscountCents: discount.discountCents,
          }
        : {}),
    };
    if (!(await this.repo.updateReward(updated, r.status))) this.reject('ALREADY_REDEEMED');
    return { ...rewardDto(updated, this.clock.now(), liga), ...(discount ? { discount } : {}) };
  }
}
