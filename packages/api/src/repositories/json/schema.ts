import { z } from 'zod';
import {
  benefitSchema,
  businessSchema,
  purchaseResultSchema,
  streakDefinitionSchema,
} from '@club/shared';

const consentSchema = z.object({
  acceptedAt: z.string(),
  policyVersion: z.string(),
  channel: z.enum(['WEB_CHECKBOX', 'POS_VERBAL']),
});
const customerSchema = z.object({
  ci: z.string(),
  email: z.string().optional(),
  registrationChannel: z.enum(['WEB_QR', 'WEB_SOCIAL', 'WEB_DIRECT', 'POS']),
  registeredAtBusinessId: z.string().optional(),
  consent: consentSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
  lastLoginAt: z.string().optional(),
  legacy: z
    .array(z.object({ tenant: z.string(), createdAt: z.string(), consent: consentSchema }))
    .optional(),
});
const progressSchema = z.object({
  ci: z.string(),
  progressKey: z.string(),
  streakId: z.string(),
  monthKey: z.string(),
  totalCents: z.number().int().nonnegative(),
  purchaseCount: z.number().int().nonnegative(),
  businessesVisited: z.array(z.string()),
  firstPurchaseAt: z.string(),
  lastPurchaseAt: z.string(),
  updatedAt: z.string(),
});
const purchaseSchema = z.object({
  purchaseId: z.string(),
  ci: z.string(),
  businessId: z.string(),
  transactionId: z.string(),
  storeId: z.string().optional(),
  amountCents: z.number().int().positive(),
  purchasedAt: z.string(),
  monthKey: z.string(),
  streakIds: z.array(z.string()),
  issuedRewardIds: z.array(z.string()),
  createdAt: z.string(),
  registeredNow: z.boolean(),
  result: purchaseResultSchema.optional(),
});
// Stored benefit snapshots may predate the requirement for percentage caps.
const storedBenefitSchema = z.object(benefitSchema.shape);
const rewardSchema = z.object({
  ci: z.string(),
  rewardInstanceId: z.string(),
  code: z.string(),
  status: z.enum(['PENDING_CHOICE', 'AVAILABLE', 'REDEEMED']),
  streakId: z.string(),
  monthKey: z.string(),
  tierId: z.enum(['BRONZE', 'SILVER', 'GOLD']),
  rewardId: z.string(),
  benefit: storedBenefitSchema.optional(),
  options: z.array(storedBenefitSchema).optional(),
  installment: z.number().int().nonnegative(),
  validFrom: z.string(),
  expiresAt: z.string(),
  issuedAt: z.string(),
  issuedByPurchaseId: z.string(),
  chosenAt: z.string().optional(),
  redeemedAt: z.string().optional(),
  redeemedAtBusinessId: z.string().optional(),
  redeemedTransactionId: z.string().optional(),
  redeemedPurchaseAmountCents: z.number().int().positive().optional(),
  appliedDiscountCents: z.number().int().nonnegative().optional(),
});
export const snapshotSchema = z.object({
  version: z.literal(1),
  businesses: z.array(businessSchema),
  streaks: z.array(streakDefinitionSchema),
  customers: z.array(customerSchema),
  progress: z.array(progressSchema),
  purchases: z.array(purchaseSchema),
  rewards: z.array(rewardSchema),
});
