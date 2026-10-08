import { z } from 'zod';
import { isValidCi, normalizeCi } from '../domain/ci';
const slug = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  .max(80);
export const ciSchema = z.string().transform(normalizeCi).refine(isValidCi, 'INVALID_CI');
export const emailSchema = z.string().trim().toLowerCase().max(254).pipe(z.email());
export const optionalEmailSchema = z.preprocess(
  (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
  emailSchema.optional(),
);
export const benefitSchema = z
  .object({
    benefitId: slug,
    type: z.enum([
      'PERCENT_DISCOUNT',
      'FIXED_DISCOUNT',
      'FREE_DELIVERY',
      'SPECIAL_DAYS_EARLY_ACCESS',
      'SPECIAL_DAYS_DISCOUNT',
      'IN_STORE_PERK',
      'PARTNER_EXPERIENCE',
    ]),
    title: z.string().min(1).max(40),
    description: z.string().min(1),
    percent: z.number().int().min(1).max(100).optional(),
    amountCents: z.number().int().min(1).max(1_000_000).optional(),
    maxDiscountCents: z.number().int().min(1).max(1_000_000).optional(),
    businessIds: z.array(slug).min(1).optional(),
    partnerName: z.string().optional(),
    monthlyInstallments: z.number().int().min(1).max(12).optional(),
  })
  .superRefine((b, ctx) => {
    const percent = b.type === 'PERCENT_DISCOUNT' || b.type === 'SPECIAL_DAYS_DISCOUNT';
    const fixed = b.type === 'FIXED_DISCOUNT';
    if (percent !== (b.percent !== undefined) || percent !== (b.maxDiscountCents !== undefined))
      ctx.addIssue({
        code: 'custom',
        message: 'Porcentaje y tope requeridos solo para descuentos porcentuales',
      });
    if (fixed !== (b.amountCents !== undefined))
      ctx.addIssue({ code: 'custom', message: 'Monto requerido solo para descuentos fijos' });
  });
const unique = (ids: string[]) => new Set(ids).size === ids.length;
export const rewardDefinitionSchema = z
  .object({
    rewardId: slug,
    requiredConsecutiveMonths: z.number().int().min(1).max(36),
    selection: z.enum(['ALL', 'ONE_OF']),
    validForMonths: z.number().int().min(1).max(12),
    benefits: z.array(benefitSchema).min(1),
  })
  .superRefine((r, c) => {
    if (!unique(r.benefits.map((b) => b.benefitId)))
      c.addIssue({ code: 'custom', message: 'Beneficios duplicados' });
    if (
      r.selection === 'ONE_OF' &&
      (r.benefits.length < 2 || r.benefits.some((b) => (b.monthlyInstallments ?? 1) !== 1))
    )
      c.addIssue({ code: 'custom', message: 'ONE_OF requiere opciones sin cuotas' });
  });
export const tierSchema = z.object({
  tierId: z.enum(['BRONZE', 'SILVER', 'GOLD']),
  name: z.string().min(1),
  minMonthlyCents: z.number().int().min(1).max(1_000_000),
  receiptTeaser: z.string().min(1),
  rewards: z.array(rewardDefinitionSchema).min(1),
});
export const streakDefinitionSchema = z
  .object({
    streakId: slug,
    name: z.string().min(1).max(20),
    displayOrder: z.number().int().min(0),
    description: z.string(),
    period: z.literal('CALENDAR_MONTH'),
    timeZone: z.literal('America/Guayaquil'),
    businessIds: z.array(slug).min(1),
    tiers: z.array(tierSchema).min(1),
    active: z.boolean(),
    version: z.number().int().min(1),
  })
  .superRefine((d, c) => {
    if (
      !unique(d.tiers.map((t) => t.tierId)) ||
      !unique(d.businessIds) ||
      !unique(d.tiers.flatMap((t) => t.rewards.map((r) => r.rewardId))) ||
      d.tiers.some((t, i) => i > 0 && t.minMonthlyCents <= (d.tiers[i - 1]?.minMonthlyCents ?? 0))
    )
      c.addIssue({
        code: 'custom',
        message: 'Niveles e identificadores deben ser únicos y ascendentes',
      });
  });
export const businessSchema = z.object({
  businessId: slug,
  name: z.string(),
  brand: z.string(),
  category: z.enum(['PHARMACY', 'DERMOCOSMETICS', 'PETS', 'HOME']),
  description: z.string(),
  active: z.boolean(),
});
export const programConfigSchema = z
  .object({
    id: z.literal('smartclub'),
    displayName: z.string(),
    shortName: z.string(),
    stackName: z.string(),
    groupName: z.literal('Farmaenlace'),
    tagline: z.string(),
    rewardCodePrefix: z.literal('SC'),
    theme: z.record(z.string(), z.string()),
    businesses: z.array(businessSchema).min(1),
    streaks: z.array(streakDefinitionSchema).min(1),
  })
  .superRefine((p, c) => {
    const ids = p.businesses.map((b) => b.businessId);
    if (
      !unique(ids) ||
      !unique(p.streaks.map((s) => s.streakId)) ||
      new Set(p.streaks.map((s) => s.displayOrder)).size !== p.streaks.length
    )
      c.addIssue({ code: 'custom', message: 'Identificadores y orden deben ser únicos' });
    for (const s of p.streaks) {
      if (s.businessIds.some((id) => !ids.includes(id)))
        c.addIssue({ code: 'custom', message: 'Negocio desconocido' });
      if (
        s.tiers.some((t) =>
          t.rewards.some((r) =>
            r.benefits.some((b) => b.businessIds?.some((id) => !s.businessIds.includes(id))),
          ),
        )
      )
        c.addIssue({ code: 'custom', message: 'Beneficio fuera de su liga' });
    }
  });
export const registrationSchema = z.object({
  ci: ciSchema,
  email: optionalEmailSchema,
  acceptPrivacyPolicy: z.literal(true),
  source: z
    .object({ channel: z.enum(['QR', 'SOCIAL', 'DIRECT']), businessId: slug.optional() })
    .optional(),
});
export const loginSchema = z.object({ ci: ciSchema });
export const receiptWidthSchema = z
  .union([z.literal(32), z.literal(40), z.literal(48)])
  .default(40);
export const posCustomerSchema = registrationSchema.pick({
  ci: true,
  email: true,
  acceptPrivacyPolicy: true,
});
export const posProgressSchema = z.object({ ci: ciSchema, receiptWidth: receiptWidthSchema });
export const purchaseSchema = z.object({
  transactionId: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[A-Za-z0-9_-]+$/),
  ci: ciSchema,
  registration: z
    .object({ acceptPrivacyPolicy: z.literal(true), email: optionalEmailSchema })
    .optional(),
  amountCents: z.number().int().min(1).max(1_000_000),
  purchasedAt: z.iso.datetime({ offset: true }).optional(),
  storeId: z.string().max(100).optional(),
  receiptWidth: receiptWidthSchema,
});
export type PurchaseInput = z.infer<typeof purchaseSchema>;
export const chooseSchema = z.object({ benefitId: slug });
export const codeSchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^(SC|ECO|FRM)-[0-9A-HJKMNP-TV-Z]{8}$/),
});
export const lookupSchema = codeSchema.extend({
  purchaseAmountCents: z.number().int().min(1).max(1_000_000).optional(),
});
export const redeemSchema = lookupSchema.extend({
  transactionId: z.string().max(100).optional(),
  benefitId: slug.optional(),
});
export const historySchema = z.object({
  months: z.coerce.number().int().min(1).max(12).default(6),
});
export const errorEnvelopeSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
    reason: z.string().optional(),
  }),
});

// Public response contracts deliberately have no raw email or internal reward/customer keys.
export const customerDtoSchema = z.object({
  ci: ciSchema,
  emailMasked: z.string().nullable(),
  registeredAt: z.iso.datetime(),
  registrationChannel: z.enum(['WEB_QR', 'WEB_SOCIAL', 'WEB_DIRECT', 'POS']).optional(),
});
export const authResponseSchema = z.object({
  token: z.string().min(1),
  customer: customerDtoSchema,
});
export const discountResultSchema = z.object({
  purchaseAmountCents: z.number().int().min(1).max(1_000_000),
  discountCents: z.number().int().min(0),
  capCents: z.number().int().positive(),
  capped: z.boolean(),
});
export const customerRewardDtoSchema = z.object({
  streakId: slug,
  streakName: z.string(),
  redeemableAt: z.array(slug),
  discount: discountResultSchema.optional(),
  code: codeSchema.shape.code,
  status: z.enum(['PENDING_CHOICE', 'AVAILABLE', 'REDEEMED', 'EXPIRED']),
  tierId: tierSchema.shape.tierId,
  tierName: z.string(),
  monthKey: z.string().regex(/^\d{4}-\d{2}$/),
  benefit: benefitSchema.optional(),
  options: z.array(benefitSchema).optional(),
  validFrom: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
  redeemedAt: z.iso.datetime().optional(),
});
const tierIdentitySchema = z.object({ tierId: tierSchema.shape.tierId, name: z.string() });
export const progressSummarySchema = z.object({
  streakId: z.string(),
  streakName: z.string(),
  monthKey: z.string().regex(/^\d{4}-\d{2}$/),
  monthLabel: z.string(),
  daysLeftInMonth: z.number().int().min(0),
  totalCents: z.number().int().min(0),
  purchaseCount: z.number().int().min(0),
  currentTier: tierIdentitySchema.nullable(),
  nextTier: tierIdentitySchema
    .extend({
      minMonthlyCents: z.number().int(),
      gapCents: z.number().int().positive(),
      receiptTeaser: z.string(),
    })
    .nullable(),
  tiers: z.array(
    tierIdentitySchema.extend({
      minMonthlyCents: z.number().int(),
      reachedThisMonth: z.boolean(),
      streak: z.object({
        consecutiveMonths: z.number().int().min(0).max(36),
        status: z.enum(['ACTIVE', 'AT_RISK', 'NONE']),
      }),
      rewards: z.array(
        rewardDefinitionSchema.safeExtend({
          progressInCycle: z.number().int().min(0),
          unlockedThisMonth: z.boolean(),
        }),
      ),
    }),
  ),
  businessIds: z.array(slug),
  hasPurchasesInLookback: z.boolean().optional(),
  businessesVisited: z.array(z.string()),
  message: z.string(),
});
export const receiptSchema = z.object({ message: z.string(), lines: z.array(z.string()) });
export const programDtoSchema = z.object({
  program: z.object({
    id: programConfigSchema.shape.id,
    displayName: z.string(),
    shortName: z.string(),
    tagline: z.string(),
  }),
  streaks: z.array(streakDefinitionSchema),
  businesses: z.array(businessSchema),
});
export const purchaseResultSchema = z.object({
  purchase: z.object({
    purchaseId: z.string(),
    amountCents: z.number().int().positive(),
    purchasedAt: z.iso.datetime(),
    monthKey: z.string(),
  }),
  customer: customerDtoSchema.extend({ registeredNow: z.boolean() }),
  progress: z.array(progressSummarySchema),
  newRewards: z.array(customerRewardDtoSchema),
  receipt: receiptSchema,
});
