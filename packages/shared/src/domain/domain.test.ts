import { describe, it, expect } from 'vitest';
import {
  TENANTS,
  isValidCi,
  normalizeCi,
  maskCi,
  makeValidCi,
  maskEmail,
  formatMoney,
  dollarsToCents,
  monthKeyOf,
  addMonths,
  monthBounds,
  monthLabel,
  daysLeftInMonth,
  tierForTotal,
  nextTier,
  compareTiers,
  streakCount,
  tierStreakStatus,
  progressInCycle,
  dueRewards,
  buildRewardInstances,
  generateRewardCode,
  rewardDto,
  buildProgressSummary,
  buildProgressMessage,
  asciiFold,
  wrapLines,
  tenantConfigSchema,
  streakDefinitionSchema,
  purchaseSchema,
  registrationSchema,
  benefitSchema,
  localTableNames,
} from '../index';
import type { CustomerReward, CustomerRewardDto, StreakDefinition } from '../index';
const eco = TENANTS.ecoclub;
const def = eco.streak;
const now = new Date('2026-10-08T17:00:00Z');
function summary(total: number, history: Record<string, number> = {}, month = '2026-10') {
  return buildProgressSummary(
    def,
    Object.entries({ ...history, [month]: total }).map(([m, t]) => ({
      ci: '1700000001',
      progressKey: def.streakId + '#' + m,
      streakId: def.streakId,
      monthKey: m,
      totalCents: t,
      purchaseCount: 1,
      businessesVisited: ['farmacias-economicas'],
      firstPurchaseAt: now.toISOString(),
      lastPurchaseAt: now.toISOString(),
      updatedAt: now.toISOString(),
    })),
    month,
    now,
  );
}
const golden =
  '¡Vas por buen camino! Llevas $18 este mes. Solo te faltan $7 para llegar a ORO y ganar un cupón de envío a domicilio gratis. Racha PLATA: mes 1 de 3. ¡Mantén tu nivel el próximo mes!';
describe('CI and privacy', () => {
  it.each(['1700000001', '1700000019', '1700000027', '0900000001', '0900000019'])(
    'validates %s',
    (ci) => {
      expect(isValidCi(ci)).toBe(true);
    },
  );
  it.each(['1700000002', '2500000001', '1760000001', '170000000', 'abcdefghij', '0000000000'])(
    'rejects %s',
    (ci) => {
      expect(isValidCi(ci)).toBe(false);
    },
  );
  it('normalizes and masks identifiers', () => {
    expect(normalizeCi('170 000-0001')).toBe('1700000001');
    expect(makeValidCi('300000000')).toMatch(/^300000000\d$/);
    expect(isValidCi(makeValidCi('300000000'))).toBe(true);
    expect(() => makeValidCi('abc')).toThrow();
    expect(maskCi('1700000001')).toBe('17******01');
    expect(maskEmail('cliente@example.com')).toBe('c*****e@example.com');
    expect(maskEmail('a@example.com')).toBe('a*****@example.com');
  });
});
describe('money and Guayaquil months', () => {
  it.each([
    [1800, '$18'],
    [1850, '$18,50'],
    [123450, '$1.234,50'],
  ])('formats %i', (cents, text) => {
    expect(formatMoney(cents)).toBe(text);
  });
  it('parses decimal strings exactly', () => {
    expect(dollarsToCents('18.5')).toBe(1850);
    expect(dollarsToCents('18,50')).toBe(1850);
    expect(dollarsToCents('0.01')).toBe(1);
    expect(dollarsToCents('18')).toBe(1800);
    expect(() => dollarsToCents('1.234.5')).toThrow();
    expect(() => dollarsToCents('99999999999999999')).toThrow();
    expect(() => formatMoney(18.5)).toThrow();
  });
  it('handles timezone and year boundaries', () => {
    expect(monthKeyOf('2026-11-01T04:30:00Z')).toBe('2026-10');
    expect(monthKeyOf('2026-11-01T05:00:00Z')).toBe('2026-11');
    expect(addMonths('2026-12', 1)).toBe('2027-01');
    expect(addMonths('2026-01', -1)).toBe('2025-12');
    expect(monthBounds('2026-12').end.toISOString()).toBe('2027-01-01T04:59:59.999Z');
    expect(daysLeftInMonth(now)).toBe(24);
    expect(monthLabel('2026-10')).toBe('octubre 2026');
  });
});
describe('tiers and streaks', () => {
  for (const [id, limits] of [
    ['ecoclub', [1000, 1500, 2500]],
    ['farmaclub', [3000, 6000, 12000]],
  ] as const) {
    it('uses lower-inclusive boundaries for ' + id, () => {
      const d = TENANTS[id].streak;
      for (const [i, min] of limits.entries()) {
        expect(tierForTotal(d, min)?.tierId).toBe(['BRONZE', 'SILVER', 'GOLD'][i]);
        expect(tierForTotal(d, min - 1)?.tierId ?? null).toBe(
          i === 0 ? null : ['BRONZE', 'SILVER'][i - 1],
        );
      }
      expect(nextTier(d, limits[2])).toBeNull();
      expect(nextTier(d, 0)?.gapCents).toBe(limits[0]);
    });
  }
  it('reproduces the worked example and risk', () => {
    const totals = {
      '2026-08': 1200,
      '2026-09': 2000,
      '2026-10': 1600,
      '2026-11': 3000,
      '2026-12': 400,
    };
    const months = Object.keys(totals);
    const expected = [
      [1, 0, 0],
      [2, 1, 0],
      [3, 2, 0],
      [4, 3, 1],
      [0, 0, 0],
    ];
    for (const [i, m] of months.entries())
      expect(def.tiers.map((t) => streakCount(t, m, totals))).toEqual(expected[i]);
    const silver = def.tiers[1];
    if (!silver) throw new Error();
    expect(tierStreakStatus(silver, '2026-12', totals)).toEqual({
      status: 'AT_RISK',
      consecutiveMonths: 3,
    });
    expect(tierStreakStatus(silver, '2027-01', totals)).toEqual({
      status: 'NONE',
      consecutiveMonths: 0,
    });
    expect(tierStreakStatus(silver, '2026-10', totals)).toEqual({
      status: 'ACTIVE',
      consecutiveMonths: 2,
    });
    const all = Object.fromEntries(
      Array.from({ length: 40 }, (_, i) => [addMonths('2026-12', -i), 3000]),
    );
    expect(streakCount(silver, '2026-12', all)).toBe(36);
    expect(progressInCycle(3, 3, true)).toBe(3);
    expect(progressInCycle(3, 3, false)).toBe(0);
    expect(compareTiers(silver, def.tiers[0] ?? silver)).toBeGreaterThan(0);
  });
  it('issues cumulatively at 3/6 and restarts after a gap', () => {
    const totals = Object.fromEntries(
      Array.from({ length: 6 }, (_, i) => [addMonths('2026-01', i), 3000]),
    );
    for (let i = 0; i < 6; i++)
      expect(dueRewards(def, totals, addMonths('2026-01', i)).map((r) => r.tier.tierId)).toEqual(
        (i + 1) % 3 === 0 ? ['BRONZE', 'SILVER', 'GOLD'] : ['BRONZE'],
      );
    totals['2026-04'] = 0;
    expect(dueRewards(def, totals, '2026-06').map((r) => r.tier.tierId)).toEqual(['BRONZE']);
    expect(dueRewards(def, totals, '2026-04')).toEqual([]);
  });
});
describe('reward instances', () => {
  it('produces deterministic choices and three delivery windows across new year', () => {
    const silver = def.tiers[1];
    const gold = def.tiers[2];
    if (!silver?.rewards[0] || !gold?.rewards[0]) throw new Error();
    const input = {
      ci: '1700000001',
      streakId: def.streakId,
      month: '2026-12',
      now: new Date('2026-12-20T17:00:00Z'),
      purchaseId: 'sale',
    };
    const choice = buildRewardInstances({ ...input, tier: silver, reward: silver.rewards[0] });
    expect(choice).toHaveLength(1);
    expect(choice[0]?.status).toBe('PENDING_CHOICE');
    expect(choice[0]?.rewardInstanceId).toBe('liga-ahorro#2026-12#SILVER#plata-eleccion#choice');
    const instances = buildRewardInstances({ ...input, tier: gold, reward: gold.rewards[0] });
    const delivery = instances.filter((r) => r.benefit?.type === 'FREE_DELIVERY');
    expect(delivery).toHaveLength(3);
    expect(delivery.map((r) => [r.validFrom, r.expiresAt])).toEqual([
      ['2026-12-20T17:00:00.000Z', '2027-02-01T04:59:59.999Z'],
      ['2027-02-01T05:00:00.000Z', '2027-03-01T04:59:59.999Z'],
      ['2027-03-01T05:00:00.000Z', '2027-04-01T04:59:59.999Z'],
    ]);
    expect(generateRewardCode('ECO', () => 0)).toBe('ECO-00000000');
    const r = { ...choice[0], code: 'ECO-00000000' } as CustomerReward;
    expect(rewardDto(r, new Date('2027-03-01T05:00Z')).status).toBe('EXPIRED');
    expect(rewardDto({ ...r, status: 'REDEEMED' }, new Date('2027-03-01T05:00Z')).status).toBe(
      'REDEEMED',
    );
  });
});
describe('receipts', () => {
  it('matches the golden UTF-8 text and thermal receipt verbatim', () => {
    const receipt = buildProgressMessage({ displayName: 'EcoClub', summary: summary(1800) });
    expect(receipt.message).toBe(golden);
    expect(receipt.lines).toEqual([
      '----------------------------------------',
      '           ECOCLUB - TU RACHA',
      'Mes: OCTUBRE 2026           Nivel: PLATA',
      'Acumulado: $18                Faltan: $7',
      '[##############------]               ORO',
      'Vas por buen camino! Llevas $18 este',
      'mes. Solo te faltan $7 para llegar a ORO',
      'y ganar un cupon de envio a domicilio',
      'gratis.',
      'Racha PLATA: mes 1 de 3. Manten tu nivel',
      'el proximo mes!',
      '----------------------------------------',
    ]);
  });
  it('selects welcome, returning, top tier and at-risk messages', () => {
    expect(buildProgressMessage({ displayName: 'EcoClub', summary: summary(0) }).message).toContain(
      '¡Bienvenido',
    );
    expect(
      buildProgressMessage({
        displayName: 'EcoClub',
        summary: summary(300),
        hasEarlierPurchases: true,
      }).message,
    ).toContain('¡Sigue sumando!');
    expect(
      buildProgressMessage({ displayName: 'EcoClub', summary: summary(3000) }).message,
    ).toContain('¡Eres ORO');
    expect(
      buildProgressMessage({ displayName: 'EcoClub', summary: summary(400, { '2026-09': 1800 }) })
        .message,
    ).toContain('¡No pierdas tu racha PLATA!');
    expect(
      buildProgressMessage({
        displayName: 'EcoClub',
        summary: summary(1500, { '2026-09': 1500, '2026-08': 1500 }),
      }).message,
    ).not.toContain('Racha PLATA');
  });
  it('announces one/multiple codes, folds ASCII and respects all widths', () => {
    const base: CustomerRewardDto = {
      code: 'ECO-00000000',
      status: 'AVAILABLE',
      tierId: 'BRONZE',
      tierName: 'Bronce',
      monthKey: '2026-10',
      validFrom: now.toISOString(),
      expiresAt: now.toISOString(),
      benefit: def.tiers[0]?.rewards[0]?.benefits[0],
    };
    expect(
      buildProgressMessage({ displayName: 'EcoClub', summary: summary(1000), newRewards: [base] })
        .message,
    ).toContain('Código: ECO-00000000.');
    expect(
      buildProgressMessage({
        displayName: 'EcoClub',
        summary: summary(1000),
        newRewards: [base, base],
        appHost: 'club.example',
      }).message,
    ).toContain('Revisa tus códigos en club.example.');
    expect(asciiFold('¡Ñandú! ¿sí? ☺')).toBe('Nandu! si? ');
    expect(wrapLines('averylongword', 4)).toEqual(['aver', 'ylon', 'gwor', 'd']);
    expect(wrapLines('', 32)).toEqual([]);
    for (const width of [32, 40, 48] as const)
      for (const total of [0, 1800, 3000]) {
        const r = buildProgressMessage({
          displayName: 'EcoClub',
          summary: summary(total),
          newRewards: [base],
          width,
        });
        expect(r.lines.every((line) => line.length <= width)).toBe(true);
      }
    const empty = buildProgressSummary(def, [], '2025-01', now);
    expect(empty.totalCents).toBe(0);
    expect(empty.daysLeftInMonth).toBe(0);
    expect(empty.businessesVisited).toEqual([]);
  });
});
describe('schemas and tenant definitions', () => {
  it('validates all configs and references', () => {
    for (const t of Object.values(TENANTS))
      expect(tenantConfigSchema.safeParse(t).success).toBe(true);
    expect(localTableNames('ecoclub').TABLE_CUSTOMERS).toBe('ecoclub-local-Customers');
    expect(
      registrationSchema.parse({
        ci: '170 000-0001',
        email: ' TEST@EXAMPLE.COM ',
        acceptPrivacyPolicy: true,
      }).email,
    ).toBe('test@example.com');
    expect(
      purchaseSchema.safeParse({ ci: '1700000001', transactionId: 'x', amountCents: 1.5 }).success,
    ).toBe(false);
  });
  it('rejects invalid rules rather than ignoring them', () => {
    const invalid = (mutate: (d: StreakDefinition) => void) => {
      const d = structuredClone(def);
      mutate(d);
      return streakDefinitionSchema.safeParse(d).success;
    };
    expect(invalid((d) => d.tiers.reverse())).toBe(false);
    expect(
      invalid((d) => {
        const t = d.tiers[0];
        if (t) d.tiers.push(t);
      }),
    ).toBe(false);
    expect(
      invalid((d) => {
        const r = d.tiers[1]?.rewards[0];
        if (r) r.benefits = r.benefits.slice(0, 1);
      }),
    ).toBe(false);
    expect(
      invalid((d) => {
        const b = d.tiers[1]?.rewards[0]?.benefits[0];
        if (b) b.monthlyInstallments = 2;
      }),
    ).toBe(false);
    expect(
      invalid((d) => {
        const r = d.tiers[0]?.rewards[0];
        if (r?.benefits[0]) r.benefits.push(r.benefits[0]);
      }),
    ).toBe(false);
    expect(
      tenantConfigSchema.safeParse({ ...eco, streak: { ...def, businessIds: ['unknown'] } })
        .success,
    ).toBe(false);
    expect(
      benefitSchema.safeParse({
        benefitId: 'x',
        type: 'PERCENT_DISCOUNT',
        title: 'x',
        description: 'x',
      }).success,
    ).toBe(false);
    expect(
      benefitSchema.safeParse({
        benefitId: 'x',
        type: 'FIXED_DISCOUNT',
        title: 'x',
        description: 'x',
      }).success,
    ).toBe(false);
  });
});
