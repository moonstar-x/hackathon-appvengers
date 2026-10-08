import { describe, it, expect } from 'vitest';
import {
  PROGRAM,
  programConfigSchema,
  benefitSchema,
  optionalEmailSchema,
  codeSchema,
  computeDiscount,
  isDiscountBenefit,
  buildProgressSummary,
  buildProgressMessage,
  rewardDto,
  generateRewardCode,
  compareLigas,
  purchaseSchema,
  posCustomerSchema,
  customerDtoSchema,
} from '../index';
import type { BenefitDefinition, CustomerReward, ProgramConfig } from '../index';
const percent: BenefitDefinition = {
  benefitId: 'cashback',
  type: 'PERCENT_DISCOUNT',
  title: 'Cashback',
  description: 'Cashback',
  percent: 5,
  maxDiscountCents: 100,
};
const fixed: BenefitDefinition = {
  benefitId: 'coupon',
  type: 'FIXED_DISCOUNT',
  title: 'Cupón',
  description: 'Cupón',
  amountCents: 200,
};
const perk: BenefitDefinition = {
  benefitId: 'perk',
  type: 'IN_STORE_PERK',
  title: 'Café',
  description: 'Café',
};
const now = new Date('2026-10-08T17:00:00Z');
describe('SmartClub catalog invariants', () => {
  it('accepts the single catalog and rejects ambiguous ligas and references', () => {
    expect(programConfigSchema.safeParse(PROGRAM).success).toBe(true);
    const invalid = (mutate: (p: ProgramConfig) => void) => {
      const p = structuredClone(PROGRAM);
      mutate(p);
      expect(programConfigSchema.safeParse(p).success).toBe(false);
    };
    invalid((p) => p.businesses.push(required(p.businesses[0])));
    invalid((p) => p.streaks.push(required(p.streaks[0])));
    invalid((p) => {
      required(p.streaks[1]).displayOrder = required(p.streaks[0]).displayOrder;
    });
    invalid((p) => {
      required(p.streaks[0]).businessIds = ['unknown'];
    });
    invalid((p) => {
      required(
        required(required(required(p.streaks[0]).tiers[0]).rewards[0]).benefits[0],
      ).businessIds = ['medicity'];
    });
    invalid((p) => {
      required(p.streaks[0]).name = 'x'.repeat(21);
    });
    invalid((p) => {
      required(p.streaks[0]).displayOrder = -1;
    });
    expect(compareLigas(required(PROGRAM.streaks[0]), required(PROGRAM.streaks[1]))).toBeLessThan(
      0,
    );
    expect(
      compareLigas(
        { ...required(PROGRAM.streaks[0]), displayOrder: 2 },
        required(PROGRAM.streaks[1]),
      ),
    ).toBeLessThan(0);
  });
  it.each([
    'PERCENT_DISCOUNT',
    'SPECIAL_DAYS_DISCOUNT',
    'FIXED_DISCOUNT',
    'FREE_DELIVERY',
    'SPECIAL_DAYS_EARLY_ACCESS',
    'IN_STORE_PERK',
    'PARTNER_EXPERIENCE',
  ] as const)('checks every allowed and forbidden monetary field for %s', (type) => {
    const base = { benefitId: 'test', type, title: 'Test', description: 'Test' };
    for (const hasPercent of [false, true])
      for (const hasAmount of [false, true])
        for (const hasCap of [false, true]) {
          const candidate = {
            ...base,
            ...(hasPercent ? { percent: 5 } : {}),
            ...(hasAmount ? { amountCents: 100 } : {}),
            ...(hasCap ? { maxDiscountCents: 100 } : {}),
          };
          const percentage = type === 'PERCENT_DISCOUNT' || type === 'SPECIAL_DAYS_DISCOUNT';
          expect(benefitSchema.safeParse(candidate).success).toBe(
            hasPercent === percentage &&
              hasCap === percentage &&
              hasAmount === (type === 'FIXED_DISCOUNT'),
          );
        }
  });
  it.each([0, -1, 1.5, 1_000_001])('rejects cap %s', (cap) =>
    expect(benefitSchema.safeParse({ ...percent, maxDiscountCents: cap }).success).toBe(false),
  );
});
describe('integer discounts', () => {
  it.each([
    [percent, 1000, 50, false],
    [percent, 2000, 100, false],
    [percent, 5000, 100, true],
    [percent, 19, 0, false],
    [
      { ...percent, type: 'SPECIAL_DAYS_DISCOUNT', percent: 25, maxDiscountCents: 1250 },
      4000,
      1000,
      false,
    ],
    [{ ...percent, percent: 25, maxDiscountCents: 1250 }, 50000, 1250, true],
    [fixed, 150, 150, false],
    [fixed, 1000, 200, false],
  ] as const)('computes ticket %i', (benefit, amount, discount, capped) => {
    expect(isDiscountBenefit(benefit)).toBe(true);
    expect(computeDiscount(benefit, amount)).toEqual({
      purchaseAmountCents: amount,
      discountCents: discount,
      capCents: benefit.type === 'FIXED_DISCOUNT' ? benefit.amountCents : benefit.maxDiscountCents,
      capped,
    });
  });
  it('refuses unsupported benefits or unsafe inputs', () => {
    expect(isDiscountBenefit(perk)).toBe(false);
    expect(() => computeDiscount(perk, 1000)).toThrow();
    for (const amount of [0, -1, 0.5, 1_000_001, NaN])
      expect(() => computeDiscount(percent, amount)).toThrow();
    for (const cap of [undefined, -1, 1.5, 1_000_001])
      expect(() => computeDiscount({ ...percent, maxDiscountCents: cap }, 100)).toThrow();
    for (const value of [undefined, 0, -1, 1.5, 101])
      expect(() => computeDiscount({ ...percent, percent: value }, 100)).toThrow();
  });
});
describe('public v2 contracts', () => {
  it('accepts optional email but still requires explicit consent', () => {
    expect(optionalEmailSchema.parse(' \t ')).toBeUndefined();
    expect(optionalEmailSchema.parse(undefined)).toBeUndefined();
    expect(optionalEmailSchema.parse(' TEST@EXAMPLE.COM ')).toBe('test@example.com');
    expect(optionalEmailSchema.safeParse('invalid').success).toBe(false);
    expect(posCustomerSchema.safeParse({ ci: '1700000035' }).success).toBe(false);
    const input = { ci: '1700000035', transactionId: 'test', amountCents: 100 };
    expect(purchaseSchema.parse({ ...input, email: 'legacy@example.com' })).not.toHaveProperty(
      'email',
    );
    expect(
      purchaseSchema.parse({ ...input, registration: { acceptPrivacyPolicy: true, email: '' } })
        .registration?.email,
    ).toBeUndefined();
    expect(
      purchaseSchema.safeParse({ ...input, registration: { acceptPrivacyPolicy: false } }).success,
    ).toBe(false);
    expect(
      customerDtoSchema.safeParse({
        ci: input.ci,
        emailMasked: null,
        registeredAt: now.toISOString(),
      }).success,
    ).toBe(true);
  });
  it('accepts new and legacy codes', () => {
    for (const prefix of ['SC', 'ECO', 'FRM'])
      expect(codeSchema.safeParse({ code: `${prefix}-00000000` }).success).toBe(true);
    for (const code of ['XX-00000000', 'SC-OOOOOOOO', 'SC-0000000'])
      expect(codeSchema.safeParse({ code }).success).toBe(false);
    expect(generateRewardCode('SC', () => 31)).toBe('SC-ZZZZZZZZ');
  });
  it('resolves reward liga names and scope including choice unions and unknown ligas', () => {
    const liga = required(PROGRAM.streaks[1]);
    const r: CustomerReward = {
      ci: '1700000001',
      rewardInstanceId: 'test',
      streakId: liga.streakId,
      tierId: 'BRONZE',
      rewardId: 'test',
      monthKey: '2026-10',
      code: 'SC-00000000',
      status: 'AVAILABLE',
      benefit: perk,
      installment: 0,
      validFrom: now.toISOString(),
      expiresAt: now.toISOString(),
      issuedAt: now.toISOString(),
      issuedByPurchaseId: 'test',
    };
    expect(rewardDto(r, now, liga)).toMatchObject({
      streakId: liga.streakId,
      streakName: liga.name,
      redeemableAt: liga.businessIds,
    });
    expect(
      rewardDto(
        {
          ...r,
          status: 'PENDING_CHOICE',
          options: [
            { ...perk, businessIds: ['medicity'] },
            { ...perk, businessIds: ['mascotas'] },
          ],
        },
        now,
        liga,
      ).redeemableAt,
    ).toEqual(['medicity', 'mascotas']);
    expect(rewardDto(r, now)).toMatchObject({ streakName: r.streakId, redeemableAt: [] });
    expect(
      rewardDto({ ...r, benefit: { ...perk, businessIds: ['medicity'] } }, now).redeemableAt,
    ).toEqual(['medicity']);
    expect(rewardDto({ ...r, benefit: undefined }, now).redeemableAt).toEqual([]);
    expect(
      rewardDto({ ...r, status: 'PENDING_CHOICE', options: undefined }, now).redeemableAt,
    ).toEqual([]);
  });
  it('identifies an empty lookback window by calendar months, including its boundary', () => {
    const liga = required(PROGRAM.streaks[0]);
    const item = {
      ci: '1700000001',
      progressKey: 'test',
      streakId: liga.streakId,
      monthKey: '2023-10',
      totalCents: 1000,
      purchaseCount: 1,
      businessesVisited: liga.businessIds,
      firstPurchaseAt: now.toISOString(),
      lastPurchaseAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };
    expect(buildProgressSummary(liga, [item], '2026-10', now).hasPurchasesInLookback).toBe(false);
    expect(
      buildProgressSummary(liga, [{ ...item, monthKey: '2023-11' }], '2026-10', now)
        .hasPurchasesInLookback,
    ).toBe(true);
    expect(
      buildProgressSummary(liga, [{ ...item, monthKey: '2026-11' }], '2026-10', now)
        .hasPurchasesInLookback,
    ).toBe(false);
  });
  it('fits every liga receipt title at every supported width', () => {
    for (const liga of PROGRAM.streaks)
      for (const width of [32, 40, 48] as const) {
        const summary = buildProgressSummary(liga, [], '2026-10', now);
        const r = buildProgressMessage({
          brandName: PROGRAM.shortName,
          ligaName: liga.name,
          summary,
          width,
        });
        expect(r.lines[1]?.trim()).toBe(`SMARTCLUB - ${liga.name.toUpperCase()}`);
        expect(r.lines.every((line) => line.length <= width)).toBe(true);
        expect(r.message).toContain('¡Bienvenido a SmartClub!');
        expect(summary.businessIds).toEqual(liga.businessIds);
      }
  });
});

function required<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('Missing test fixture');
  return value;
}
