import type {
  BusinessDefinition,
  StreakDefinition,
  Customer,
  MonthlyProgress,
  Purchase,
  CustomerReward,
  PurchaseResult,
} from '@club/shared';
export interface Repositories {
  businesses(): Promise<BusinessDefinition[]>;
  streaks(): Promise<StreakDefinition[]>;
  seed(businesses: BusinessDefinition[], streaks: StreakDefinition[]): Promise<void>;
  customer(ci: string): Promise<Customer | undefined>;
  createCustomer(c: Customer): Promise<boolean>;
  history(ci: string, streakId: string): Promise<MonthlyProgress[]>;
  purchase(id: string): Promise<Purchase | undefined>;
  record(p: Purchase): Promise<boolean>;
  finalize(id: string, result: PurchaseResult, ids: string[]): Promise<PurchaseResult>;
  purchases(ci: string, cursor?: string): Promise<{ items: Purchase[]; cursor?: string }>;
  rewards(ci: string): Promise<CustomerReward[]>;
  rewardByCode(code: string): Promise<CustomerReward | undefined>;
  putReward(r: CustomerReward): Promise<boolean>;
  updateReward(r: CustomerReward, expected: CustomerReward['status']): Promise<boolean>;
}
