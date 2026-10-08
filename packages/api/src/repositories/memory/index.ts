import type { Repositories } from '../types';
import type {
  BusinessDefinition,
  StreakDefinition,
  Customer,
  MonthlyProgress,
  Purchase,
  CustomerReward,
  PurchaseResult,
} from '@club/shared';
export class MemoryRepositories implements Repositories {
  private businessData: BusinessDefinition[] = [];
  private streakData: StreakDefinition[] = [];
  private readonly customersData = new Map<string, Customer>();
  private readonly progressData = new Map<string, MonthlyProgress>();
  private readonly purchaseData = new Map<string, Purchase>();
  private readonly rewardData = new Map<string, CustomerReward>();
  businesses() {
    return Promise.resolve(structuredClone(this.businessData));
  }
  streaks() {
    return Promise.resolve(structuredClone(this.streakData));
  }
  seed(b: BusinessDefinition[], s: StreakDefinition[]) {
    this.businessData = structuredClone(b);
    this.streakData = structuredClone(s);
    return Promise.resolve();
  }
  customer(ci: string) {
    return Promise.resolve(structuredClone(this.customersData.get(ci)));
  }
  createCustomer(c: Customer) {
    if (this.customersData.has(c.ci)) return Promise.resolve(false);
    this.customersData.set(c.ci, structuredClone(c));
    return Promise.resolve(true);
  }
  history(ci: string, streak: string) {
    return Promise.resolve(
      structuredClone(
        [...this.progressData.values()]
          .filter((p) => p.ci === ci && p.streakId === streak)
          .sort((a, b) => b.monthKey.localeCompare(a.monthKey))
          .slice(0, 36),
      ),
    );
  }
  purchase(id: string) {
    return Promise.resolve(structuredClone(this.purchaseData.get(id)));
  }
  record(p: Purchase) {
    if (this.purchaseData.has(p.purchaseId)) return Promise.resolve(false);
    this.purchaseData.set(p.purchaseId, structuredClone(p));
    for (const id of p.streakIds) {
      const key = p.ci + '#' + id + '#' + p.monthKey;
      const prev = this.progressData.get(key);
      this.progressData.set(key, {
        ci: p.ci,
        progressKey: id + '#' + p.monthKey,
        streakId: id,
        monthKey: p.monthKey,
        totalCents: (prev?.totalCents ?? 0) + p.amountCents,
        purchaseCount: (prev?.purchaseCount ?? 0) + 1,
        businessesVisited: [...new Set([...(prev?.businessesVisited ?? []), p.businessId])],
        firstPurchaseAt: prev?.firstPurchaseAt ?? p.purchasedAt,
        lastPurchaseAt: p.purchasedAt,
        updatedAt: p.createdAt,
      });
    }
    return Promise.resolve(true);
  }
  finalize(id: string, result: PurchaseResult, ids: string[]) {
    const p = this.purchaseData.get(id);
    if (!p) throw new Error('Missing purchase');
    p.result ??= structuredClone(result);
    p.issuedRewardIds = [...new Set([...p.issuedRewardIds, ...ids])];
    return Promise.resolve(structuredClone(p.result));
  }
  purchases(ci: string, cursor?: string) {
    const offset = cursor ? Number(Buffer.from(cursor, 'base64url').toString()) : 0;
    const all = [...this.purchaseData.values()]
      .filter((p) => p.ci === ci)
      .sort((a, b) => b.purchasedAt.localeCompare(a.purchasedAt));
    return Promise.resolve({
      items: structuredClone(all.slice(offset, offset + 20)),
      cursor:
        offset + 20 < all.length
          ? Buffer.from(String(offset + 20)).toString('base64url')
          : undefined,
    });
  }
  rewards(ci: string) {
    return Promise.resolve(
      structuredClone([...this.rewardData.values()].filter((r) => r.ci === ci)),
    );
  }
  rewardByCode(code: string) {
    return Promise.resolve(
      structuredClone([...this.rewardData.values()].find((r) => r.code === code)),
    );
  }
  putReward(r: CustomerReward) {
    const key = r.ci + '#' + r.rewardInstanceId;
    if (this.rewardData.has(key)) return Promise.resolve(false);
    this.rewardData.set(key, structuredClone(r));
    return Promise.resolve(true);
  }
  updateReward(r: CustomerReward, expected: CustomerReward['status']) {
    const key = r.ci + '#' + r.rewardInstanceId;
    const prev = this.rewardData.get(key);
    if (prev?.status !== expected) return Promise.resolve(false);
    this.rewardData.set(key, structuredClone(r));
    return Promise.resolve(true);
  }
}
