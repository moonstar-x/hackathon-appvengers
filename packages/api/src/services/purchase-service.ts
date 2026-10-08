import { monthKeyOf, rewardDto } from '@club/shared';
import type { PurchaseInput, Purchase } from '@club/shared';
import type { Repositories } from '../repositories/types';
import type { Clock } from '../lib/clock';
import type { CustomerService } from './customer-service';
import { customerDto } from './customer-service';
import type { ProgramService } from './program-service';
import type { ProgressService } from './progress-service';
import type { RewardService } from './reward-service';
import { AppError } from '../lib/errors';
export class PurchaseService {
  constructor(
    private readonly repo: Repositories,
    private readonly customers: CustomerService,
    private readonly program: ProgramService,
    private readonly progress: ProgressService,
    private readonly rewards: RewardService,
    private readonly clock: Clock,
  ) {}
  async record(input: PurchaseInput, businessId: string, importHistorical = false) {
    const id = businessId + '#' + input.transactionId;
    let purchase = await this.repo.purchase(id);
    if (purchase && (purchase.ci !== input.ci || purchase.amountCents !== input.amountCents))
      throw new AppError(409, 'TRANSACTION_CONFLICT', 'La transacción ya existe con otros datos');
    if (purchase?.result) return { result: purchase.result, replay: true };
    const now = this.clock.now();
    const time = new Date(input.purchasedAt ?? now);
    let customer = await this.repo.customer(input.ci);
    let registeredNow = false;
    if (!customer) {
      if (!input.email) throw new AppError(404, 'CUSTOMER_NOT_FOUND', 'No encontramos esa cédula');
      const registered = await this.customers.register(
        { ci: input.ci, email: input.email, channel: 'POS', businessId },
        true,
      );
      customer = registered.customer;
      registeredNow = registered.registeredNow;
    }
    if (
      !purchase &&
      !importHistorical &&
      (time.getTime() > now.getTime() + 300000 || time.getTime() < now.getTime() - 72 * 3600000)
    )
      throw new AppError(
        422,
        'PURCHASE_OUT_OF_WINDOW',
        'La fecha debe estar dentro de las últimas 72 horas',
      );
    const { streaks } = await this.program.get();
    const matching = streaks.filter((s) => s.businessIds.includes(businessId));
    const candidate: Purchase = {
      purchaseId: id,
      ci: input.ci,
      businessId,
      transactionId: input.transactionId,
      storeId: input.storeId,
      amountCents: input.amountCents,
      purchasedAt: time.toISOString(),
      monthKey: monthKeyOf(time),
      streakIds: matching.map((s) => s.streakId),
      issuedRewardIds: [],
      createdAt: now.toISOString(),
      registeredNow,
    };
    const inserted = purchase ? false : await this.repo.record(candidate);
    purchase = await this.repo.purchase(id);
    if (!purchase) throw new Error('Purchase not persisted');
    if (purchase.ci !== input.ci || purchase.amountCents !== input.amountCents)
      throw new AppError(409, 'TRANSACTION_CONFLICT', 'La transacción ya existe con otros datos');
    if (purchase.result) return { result: purchase.result, replay: true };
    const issued = await this.rewards.issue(input.ci, purchase.monthKey, id, purchase.streakIds);
    const newRewards = issued.map((r) => rewardDto(r, now));
    const progress = await this.progress.get(
      input.ci,
      purchase.monthKey,
      input.receiptWidth,
      newRewards,
      businessId,
    );
    const result = await this.repo.finalize(
      id,
      {
        purchase: {
          purchaseId: id,
          amountCents: purchase.amountCents,
          purchasedAt: purchase.purchasedAt,
          monthKey: purchase.monthKey,
        },
        customer: { ...customerDto(customer), registeredNow: purchase.registeredNow },
        ...progress,
        newRewards,
      },
      issued.map((r) => r.rewardInstanceId),
    );
    return { result, replay: !inserted };
  }
}
