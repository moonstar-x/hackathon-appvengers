import { describe, it, expect, vi } from 'vitest';
import { mergeCustomers, migrateTenants, backfillReward } from '../scripts/migrate-tenants';
import type { SourceCustomer, MigrationRepository } from '../scripts/migrate-tenants';
import type { CustomerReward } from '@club/shared';
import { PROGRAM } from '@club/shared';
const original: SourceCustomer = {
  ci: '1700000001',
  tenant: 'legacy-a',
  email: 'first@example.com',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  registrationChannel: 'WEB_QR',
  registeredAtBusinessId: 'farmacias-economicas',
  consent: { acceptedAt: '2026-01-01T00:00:00Z', channel: 'WEB_CHECKBOX', policyVersion: 'v1' },
  lastLoginAt: '2026-09-01T00:00:00Z',
};
const later: SourceCustomer = {
  ...original,
  tenant: 'legacy-b',
  createdAt: '2026-02-01T00:00:00Z',
  updatedAt: '2026-02-01T00:00:00Z',
  email: 'latest@example.com',
  registrationChannel: 'POS',
  consent: { ...original.consent, channel: 'POS_VERBAL' },
  lastLoginAt: '2026-10-01T00:00:00Z',
};
const names = (prefix: string) => ({
  Customers: prefix + '-customers',
  CustomerStreakProgress: prefix + '-progress',
  Purchases: prefix + '-purchases',
  CustomerRewards: prefix + '-rewards',
});
const target = names('new');
const sources = [
  { tenant: 'legacy-a', tables: names('a') },
  { tenant: 'legacy-b', tables: names('b') },
];
const legacyBenefit = {
  ...required(required(required(required(PROGRAM.streaks[0]).tiers[0]).rewards[0]).benefits[0]),
};
delete legacyBenefit.maxDiscountCents;
const reward: CustomerReward = {
  ci: original.ci,
  streakId: 'liga-ahorro',
  rewardInstanceId: 'fixture',
  code: 'ECO-00000000',
  status: 'AVAILABLE',
  tierId: 'BRONZE',
  rewardId: 'bronce-cashback',
  monthKey: '2026-10',
  benefit: legacyBenefit,
  installment: 0,
  validFrom: '2026-10-01T05:00:00Z',
  expiresAt: '2026-11-01T04:59:59Z',
  issuedAt: '2026-10-08T17:00:00Z',
  issuedByPurchaseId: 'fixture',
};
describe('customer merge and reward backfill', () => {
  it('preserves earliest registration and consent, latest email and login, and all consent evidence', () => {
    const r = mergeCustomers([later, original]);
    expect(r).toMatchObject({
      createdAt: original.createdAt,
      registrationChannel: original.registrationChannel,
      registeredAtBusinessId: original.registeredAtBusinessId,
      consent: original.consent,
      email: later.email,
      lastLoginAt: later.lastLoginAt,
    });
    expect(r).not.toHaveProperty('tenant');
    expect(r.legacy).toHaveLength(2);
    expect(JSON.stringify(r.legacy)).not.toContain('@');
    expect(original.email).toBe('first@example.com');
  });
  it('chooses the latest available email and supports customers with no email or login', () => {
    expect(mergeCustomers([original, { ...later, email: undefined }]).email).toBe(original.email);
    const r = mergeCustomers([
      { ...original, email: undefined, lastLoginAt: undefined },
      { ...later, email: undefined, lastLoginAt: undefined },
    ]);
    expect(r.email).toBeUndefined();
    expect(r.lastLoginAt).toBeUndefined();
    expect(() => mergeCustomers([])).toThrow();
    expect(() => mergeCustomers([original, { ...later, ci: '1700000019' }])).toThrow();
  });
  it('backfills available and choice snapshots while keeping redeemed snapshots and codes', () => {
    expect(backfillReward(reward)).toMatchObject({
      code: reward.code,
      benefit: { maxDiscountCents: 100 },
    });
    expect(
      backfillReward({
        ...reward,
        benefit: undefined,
        status: 'PENDING_CHOICE',
        options: [legacyBenefit],
      }).options?.[0]?.maxDiscountCents,
    ).toBe(100);
    expect(
      backfillReward({ ...reward, status: 'REDEEMED' }).benefit?.maxDiscountCents,
    ).toBeUndefined();
    expect(() => backfillReward({ ...reward, rewardId: 'unknown' })).toThrow(
      'invalid reward snapshot',
    );
  });
});
describe('migration execution', () => {
  const fixture = () => {
    const data = new Map<string, Record<string, unknown>[]>([
      ['a-customers', [{ ...original }]],
      ['b-customers', [{ ...later }]],
      ['a-rewards', [reward as unknown as Record<string, unknown>]],
      [
        'a-purchases',
        [
          {
            purchaseId: 'farmacias-economicas#tx',
            ci: original.ci,
            businessId: 'farmacias-economicas',
            amountCents: 100,
          },
        ],
      ],
      [
        'b-purchases',
        [{ purchaseId: 'medicity#tx', ci: original.ci, businessId: 'medicity', amountCents: 200 }],
      ],
      ['a-progress', [{ ci: original.ci, progressKey: 'liga-ahorro#2026-10', totalCents: 100 }]],
    ]);
    const repo: MigrationRepository = {
      scan: vi.fn((table: string) => Promise.resolve(data.get(table) ?? [])),
      get: vi.fn((table: string, key: Record<string, unknown>) =>
        Promise.resolve(
          data.get(table)?.find((r) => Object.entries(key).every(([k, v]) => r[k] === v)),
        ),
      ),
      byCode: vi.fn((table: string, code: string) =>
        Promise.resolve(data.get(table)?.find((r) => r.code === code)),
      ),
      putIfAbsent: vi.fn((table: string, pk: string, item: Record<string, unknown>) => {
        const rows = data.get(table) ?? [];
        if (rows.some((r) => r[pk] === item[pk])) return Promise.resolve(false);
        data.set(table, [...rows, item]);
        return Promise.resolve(true);
      }),
    };
    return { repo, data };
  };
  it('dry-runs by default without any writes and reports counts only', async () => {
    const { repo } = fixture();
    const r = await migrateTenants(repo, sources, target);
    expect(r).toEqual({
      dryRun: true,
      conflicts: 0,
      written: 0,
      counts: { Customers: 1, CustomerStreakProgress: 1, Purchases: 2, CustomerRewards: 1 },
    });
    expect(repo.putIfAbsent).not.toHaveBeenCalled();
    expect(JSON.stringify(r)).not.toContain(original.ci);
    expect(JSON.stringify(r)).not.toContain('@');
  });
  it('applies conditionally and can rerun safely', async () => {
    const { repo, data } = fixture();
    expect((await migrateTenants(repo, sources, target, true)).written).toBe(5);
    expect((await migrateTenants(repo, sources, target, true)).written).toBe(0);
    expect(data.get('new-rewards')?.[0]).toMatchObject({
      code: reward.code,
      benefit: { maxDiscountCents: 100 },
    });
    expect(repo.scan).not.toHaveBeenCalledWith('a-businesses');
  });
  it('aborts all writes on source key collisions', async () => {
    const { repo, data } = fixture();
    data.set('b-progress', required(data.get('a-progress')));
    await expect(migrateTenants(repo, sources, target, true)).rejects.toThrow(
      'Migration conflicts',
    );
    expect(repo.putIfAbsent).not.toHaveBeenCalled();
  });
  it('aborts on reward codes colliding with a different destination key', async () => {
    const { repo, data } = fixture();
    data.set('new-rewards', [{ ...reward, rewardInstanceId: 'different' }]);
    await expect(migrateTenants(repo, sources, target, true)).rejects.toThrow(
      'Migration conflicts',
    );
    expect(repo.putIfAbsent).not.toHaveBeenCalled();
  });
  it('aborts on source code collisions and conflicting destination purchases', async () => {
    const { repo, data } = fixture();
    data.set('b-rewards', [{ ...reward, rewardInstanceId: 'other' }]);
    data.set('new-purchases', [
      { purchaseId: 'medicity#tx', ci: 'different', businessId: 'medicity', amountCents: 200 },
    ]);
    await expect(migrateTenants(repo, sources, target, true)).rejects.toThrow(
      'Migration conflicts',
    );
    expect(repo.putIfAbsent).not.toHaveBeenCalled();
  });
});

function required<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('Missing test fixture');
  return value;
}
