import type { DiscountResult } from '../domain/discounts';
export type TierId = 'BRONZE' | 'SILVER' | 'GOLD';
export type BenefitType =
  | 'PERCENT_DISCOUNT'
  | 'FIXED_DISCOUNT'
  | 'FREE_DELIVERY'
  | 'SPECIAL_DAYS_EARLY_ACCESS'
  | 'SPECIAL_DAYS_DISCOUNT'
  | 'IN_STORE_PERK'
  | 'PARTNER_EXPERIENCE';
export interface BenefitDefinition {
  benefitId: string;
  type: BenefitType;
  title: string;
  description: string;
  percent?: number;
  amountCents?: number;
  maxDiscountCents?: number;
  businessIds?: string[];
  partnerName?: string;
  monthlyInstallments?: number;
}
export interface RewardDefinition {
  rewardId: string;
  requiredConsecutiveMonths: number;
  selection: 'ALL' | 'ONE_OF';
  validForMonths: number;
  benefits: BenefitDefinition[];
}
export interface TierDefinition {
  tierId: TierId;
  name: string;
  minMonthlyCents: number;
  receiptTeaser: string;
  rewards: RewardDefinition[];
}
export interface StreakDefinition {
  streakId: string;
  name: string;
  displayOrder: number;
  description: string;
  period: 'CALENDAR_MONTH';
  timeZone: 'America/Guayaquil';
  businessIds: string[];
  tiers: TierDefinition[];
  active: boolean;
  version: number;
}
export interface BusinessDefinition {
  businessId: string;
  name: string;
  brand: string;
  category: 'PHARMACY' | 'DERMOCOSMETICS' | 'PETS' | 'HOME';
  description: string;
  active: boolean;
}
export type ThemeTokens = Record<string, string>;
export interface ProgramConfig {
  id: 'smartclub';
  displayName: string;
  shortName: string;
  stackName: string;
  groupName: 'Farmaenlace';
  tagline: string;
  rewardCodePrefix: 'SC';
  theme: ThemeTokens;
  businesses: BusinessDefinition[];
  streaks: StreakDefinition[];
}
export interface MonthlyProgress {
  ci: string;
  progressKey: string;
  streakId: string;
  monthKey: string;
  totalCents: number;
  purchaseCount: number;
  businessesVisited: string[];
  firstPurchaseAt: string;
  lastPurchaseAt: string;
  updatedAt: string;
}
export type MonthlyTotals = Record<string, number>;
export type RewardStatus = 'PENDING_CHOICE' | 'AVAILABLE' | 'REDEEMED';
export interface CustomerReward {
  ci: string;
  rewardInstanceId: string;
  code: string;
  status: RewardStatus;
  streakId: string;
  monthKey: string;
  tierId: TierId;
  rewardId: string;
  benefit?: BenefitDefinition;
  options?: BenefitDefinition[];
  installment: number;
  validFrom: string;
  expiresAt: string;
  issuedAt: string;
  issuedByPurchaseId: string;
  chosenAt?: string;
  redeemedAt?: string;
  redeemedAtBusinessId?: string;
  redeemedTransactionId?: string;
  redeemedPurchaseAmountCents?: number;
  appliedDiscountCents?: number;
}
export interface CustomerRewardDto {
  streakId: string;
  streakName: string;
  redeemableAt: string[];
  discount?: DiscountResult;
  code: string;
  status: RewardStatus | 'EXPIRED';
  tierId: TierId;
  tierName: string;
  monthKey: string;
  benefit?: BenefitDefinition;
  options?: BenefitDefinition[];
  validFrom: string;
  expiresAt: string;
  redeemedAt?: string;
}
export interface Customer {
  ci: string;
  email?: string;
  registrationChannel: 'WEB_QR' | 'WEB_SOCIAL' | 'WEB_DIRECT' | 'POS';
  registeredAtBusinessId?: string;
  consent: { acceptedAt: string; policyVersion: string; channel: 'WEB_CHECKBOX' | 'POS_VERBAL' };
  createdAt: string;
  updatedAt: string;
  lastLoginAt?: string;
  legacy?: Array<{ tenant: string; createdAt: string; consent: Customer['consent'] }>;
}
export interface CustomerDto {
  ci: string;
  emailMasked: string | null;
  registeredAt: string;
  registrationChannel?: Customer['registrationChannel'];
}
export interface ProgressSummary {
  streakId: string;
  streakName: string;
  monthKey: string;
  monthLabel: string;
  daysLeftInMonth: number;
  totalCents: number;
  purchaseCount: number;
  currentTier: { tierId: TierId; name: string } | null;
  nextTier: {
    tierId: TierId;
    name: string;
    minMonthlyCents: number;
    gapCents: number;
    receiptTeaser: string;
  } | null;
  tiers: Array<{
    tierId: TierId;
    name: string;
    minMonthlyCents: number;
    reachedThisMonth: boolean;
    streak: { consecutiveMonths: number; status: 'ACTIVE' | 'AT_RISK' | 'NONE' };
    rewards: Array<RewardDefinition & { progressInCycle: number; unlockedThisMonth: boolean }>;
  }>;
  businessIds: string[];
  hasPurchasesInLookback?: boolean;
  businessesVisited: string[];
  message: string;
}
export interface Receipt {
  message: string;
  lines: string[];
}
export interface Purchase {
  purchaseId: string;
  ci: string;
  businessId: string;
  transactionId: string;
  storeId?: string;
  amountCents: number;
  purchasedAt: string;
  monthKey: string;
  streakIds: string[];
  issuedRewardIds: string[];
  createdAt: string;
  registeredNow: boolean;
  result?: PurchaseResult;
}
export interface PurchaseResult {
  purchase: Pick<Purchase, 'purchaseId' | 'amountCents' | 'purchasedAt' | 'monthKey'>;
  customer: CustomerDto & { registeredNow: boolean };
  progress: ProgressSummary[];
  newRewards: CustomerRewardDto[];
  receipt: Receipt;
}
export interface ProgramDto {
  program: Pick<ProgramConfig, 'id' | 'displayName' | 'shortName' | 'tagline'>;
  streaks: StreakDefinition[];
  businesses: BusinessDefinition[];
}
export interface HistoryDto {
  ligas: Array<{
    streakId: string;
    streakName: string;
    months: Array<{
      monthKey: string;
      monthLabel: string;
      totalCents: number;
      purchaseCount: number;
      tier: TierDefinition | null;
    }>;
  }>;
}
