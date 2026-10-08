import * as fs from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PROGRAM } from '@club/shared';
import type { Customer, CustomerReward, Purchase } from '@club/shared';
import { readEnv } from '../src/config/env';
import { createContainer } from '../src/container';
import { seedDemo } from '../src/demo';
import { JsonRepositories } from '../src/repositories/json';
import { snapshotSchema } from '../src/repositories/json/schema';

vi.mock('node:fs/promises', async (importOriginal) => {
  const original = await importOriginal<typeof fs>();
  return { ...original, rename: vi.fn(original.rename) };
});

const now = new Date('2026-10-08T17:00:00Z');
const ci = '1700000035';
const customer: Customer = {
  ci,
  registrationChannel: 'WEB_DIRECT',
  consent: { acceptedAt: now.toISOString(), policyVersion: 'test', channel: 'WEB_CHECKBOX' },
  createdAt: now.toISOString(),
  updatedAt: now.toISOString(),
  legacy: [
    {
      tenant: 'ecoclub',
      createdAt: '2026-01-01T00:00:00Z',
      consent: { acceptedAt: '2026-01-01T00:00:00Z', policyVersion: 'old', channel: 'POS_VERBAL' },
    },
  ],
};
const purchase = (id: string): Purchase => ({
  purchaseId: 'medicity#' + id,
  ci,
  businessId: 'medicity',
  transactionId: id,
  amountCents: 300,
  purchasedAt: now.toISOString(),
  monthKey: '2026-10',
  streakIds: ['liga-ahorro', 'liga-wellness'],
  issuedRewardIds: [],
  createdAt: now.toISOString(),
  registeredNow: false,
});
const reward: CustomerReward = {
  ci,
  rewardInstanceId: 'fixture',
  code: 'ECO-00000000',
  status: 'AVAILABLE',
  streakId: 'liga-ahorro',
  monthKey: '2026-10',
  tierId: 'BRONZE',
  rewardId: 'bronce-cashback',
  benefit: {
    benefitId: 'cashback',
    type: 'PERCENT_DISCOUNT',
    title: 'Legacy discount',
    description: 'Legacy percentage snapshot without a cap',
    percent: 5,
  },
  installment: 0,
  validFrom: '2026-10-01T05:00:00Z',
  expiresAt: '2026-11-01T04:59:59Z',
  issuedAt: now.toISOString(),
  issuedByPurchaseId: 'fixture',
};
let directory: string;
let filePath: string;
beforeEach(async () => {
  directory = await fs.mkdtemp(join(tmpdir(), 'smartclub-json-'));
  filePath = join(directory, 'nested', 'data.json');
});
afterEach(async () => {
  vi.restoreAllMocks();
  await fs.rm(directory, { recursive: true, force: true });
});
const env = (patch: NodeJS.ProcessEnv = {}) =>
  readEnv({
    STAGE: 'local',
    DATA_DRIVER: 'json',
    DATA_FILE: filePath,
    JWT_SECRET: 'obviously-fake-local-jwt-secret-never-use-in-production',
    POS_API_KEY: 'obviously-fake-local-pos-key',
    LOG_LEVEL: 'silent',
    ...patch,
  });
const container = () => createContainer(env(), { clock: { now: () => now } });
const stored = async () =>
  snapshotSchema.parse(JSON.parse(await fs.readFile(filePath, 'utf8')) as unknown);
function required<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('Missing fixture');
  return value;
}

describe('JSON local storage', () => {
  it('starts empty and creates a private, readable file and parent directories on a write', async () => {
    const repo = new JsonRepositories(filePath);
    expect(await repo.businesses()).toEqual([]);
    expect(await repo.streaks()).toEqual([]);
    expect(await repo.customer(ci)).toBeUndefined();
    expect(await repo.purchase('missing')).toBeUndefined();
    expect(await repo.rewardByCode('missing')).toBeUndefined();
    await expect(fs.stat(filePath)).rejects.toMatchObject({ code: 'ENOENT' });
    await repo.seed(PROGRAM.businesses, PROGRAM.streaks);
    expect((await stored()).version).toBe(1);
    expect(await repo.businesses()).toEqual(PROGRAM.businesses);
    expect(await repo.streaks()).toEqual(PROGRAM.streaks);
    const mode = (await fs.stat(filePath)).mode & 0o777;
    expect(process.platform === 'win32' || mode === 0o600).toBe(true);
    expect(await fs.readdir(dirname(filePath))).toEqual(['data.json']);
  });

  it('preserves registrations, receipts, progress, reward choice and redemption after reopening', async () => {
    const first = await container();
    expect(first.repo).toBeInstanceOf(JsonRepositories);
    await seedDemo(first);
    await first.repo.createCustomer(customer);
    const input = {
      ci: '1700000001',
      transactionId: 'unlock-silver',
      amountCents: 300,
      receiptWidth: 40 as const,
    };
    const recorded = await first.purchases.record(input, 'farmacias-economicas');
    const pending = required(
      (await first.repo.rewards(input.ci)).find((r) => r.status === 'PENDING_CHOICE'),
    );
    await first.rewards.choose(input.ci, pending.code, required(pending.options?.[0]).benefitId);
    const bronze = required(
      (await first.repo.rewards(input.ci)).find(
        (r) => r.status === 'AVAILABLE' && r.monthKey === '2026-10' && r.tierId === 'BRONZE',
      ),
    );
    await first.rewards.redeem(bronze.code, 'farmacias-economicas', 'redeem-1', undefined, 5000);
    await first.purchases.record(
      { ...input, transactionId: 'later-purchase', amountCents: 700 },
      'farmacias-economicas',
    );
    await first.repo.seed(
      PROGRAM.businesses.map((business) => ({ ...business, description: 'Local catalog edit' })),
      PROGRAM.streaks,
    );
    const before = await stored();
    const second = await container();
    expect(await stored()).toEqual(before);
    expect(await second.repo.customer(ci)).toEqual(customer);
    expect(await second.repo.customer('1700000019')).not.toHaveProperty('email');
    expect(await second.repo.history(input.ci, 'liga-ahorro')).toEqual(
      await first.repo.history(input.ci, 'liga-ahorro'),
    );
    expect(await second.repo.purchases(input.ci)).toEqual(await first.repo.purchases(input.ci));
    expect(await second.repo.rewardByCode(pending.code)).toMatchObject({
      status: 'AVAILABLE',
      chosenAt: now.toISOString(),
      benefit: { benefitId: required(pending.options?.[0]).benefitId },
    });
    expect(await second.repo.rewardByCode(bronze.code)).toMatchObject({
      status: 'REDEEMED',
      redeemedAt: now.toISOString(),
      redeemedTransactionId: 'redeem-1',
      redeemedPurchaseAmountCents: 5000,
      appliedDiscountCents: 100,
    });
    await expect(second.purchases.record(input, 'farmacias-economicas')).resolves.toEqual({
      result: recorded.result,
      replay: true,
    });
    expect(await stored()).toEqual(before);
    await expect(
      second.purchases.record({ ...input, amountCents: 400 }, 'farmacias-economicas'),
    ).rejects.toMatchObject({ code: 'TRANSACTION_CONFLICT' });
  });

  it('serializes parallel conditional writes across instances and keeps purchases and progress atomic', async () => {
    const a = new JsonRepositories(filePath);
    const b = new JsonRepositories(join(directory, 'nested', '..', 'nested', 'data.json'));
    expect(
      (await Promise.all([a.createCustomer(customer), b.createCustomer(customer)])).filter(Boolean),
    ).toHaveLength(1);
    const results = await Promise.all(
      Array.from({ length: 30 }, (_, i) => (i % 2 === 0 ? a : b).record(purchase(`sale-${i}`))),
    );
    expect(results.every(Boolean)).toBe(true);
    expect(await b.record(purchase('sale-0'))).toBe(false);
    for (const streakId of ['liga-ahorro', 'liga-wellness'])
      expect((await b.history(ci, streakId))[0]).toMatchObject({
        totalCents: 9000,
        purchaseCount: 30,
        businessesVisited: ['medicity'],
      });
    expect((await stored()).purchases).toHaveLength(30);
    const page = await a.purchases(ci);
    expect(page.items).toHaveLength(20);
    expect(page.cursor).toBeTruthy();
    const nextPage = await b.purchases(ci, page.cursor);
    expect(nextPage.items).toHaveLength(10);
    expect(nextPage.cursor).toBeUndefined();
    expect(new Set([...page.items, ...nextPage.items].map((p) => p.purchaseId)).size).toBe(30);
    expect(
      (await Promise.all([a.putReward(reward), b.putReward(reward)])).filter(Boolean),
    ).toHaveLength(1);
    const updated = { ...reward, status: 'REDEEMED' as const, redeemedAt: now.toISOString() };
    expect(
      (
        await Promise.all([
          a.updateReward(updated, 'AVAILABLE'),
          b.updateReward(updated, 'AVAILABLE'),
        ])
      ).filter(Boolean),
    ).toHaveLength(1);
    const reopened = new JsonRepositories(filePath);
    expect(await reopened.rewards(ci)).toEqual([updated]);
    expect(await reopened.rewardByCode(reward.code)).toEqual(updated);
    expect(
      await reopened.updateReward({ ...updated, rewardInstanceId: 'missing' }, 'AVAILABLE'),
    ).toBe(false);
    const copy = required(await reopened.customer(ci));
    copy.consent.policyVersion = 'changed';
    expect(await reopened.customer(ci)).toEqual(customer);
  });

  it('issues once when purchases and replays run concurrently through the services', async () => {
    const c = await container();
    await c.repo.createCustomer(customer);
    const responses = await Promise.all(
      Array.from({ length: 12 }, (_, i) =>
        c.purchases.record(
          { ci, transactionId: `parallel-${i % 6}`, amountCents: 300, receiptWidth: 40 },
          'farmacias-economicas',
        ),
      ),
    );
    expect(responses.filter((r) => !r.replay)).toHaveLength(6);
    expect((await c.repo.history(ci, 'liga-ahorro'))[0]).toMatchObject({
      totalCents: 1800,
      purchaseCount: 6,
    });
    expect(await c.repo.rewards(ci)).toHaveLength(1);
    expect((await stored()).purchases.every((p) => p.result !== undefined)).toBe(true);
  });

  it.each(['{broken', '{}', '{"version":2}'])(
    'rejects an invalid file without replacing it (%s)',
    async (contents) => {
      await fs.mkdir(dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, contents);
      await expect(container()).rejects.toThrow('Invalid JSON storage file');
      expect(await fs.readFile(filePath, 'utf8')).toBe(contents);
    },
  );

  it('rejects malformed records without losing existing data', async () => {
    const c = await container();
    await c.repo.createCustomer(customer);
    const data = await stored();
    const contents = JSON.stringify({ ...data, customers: [{ ci }] });
    await fs.writeFile(filePath, contents);
    await expect(c.repo.seed(PROGRAM.businesses, PROGRAM.streaks)).rejects.toThrow(
      'Invalid JSON storage file',
    );
    expect(await fs.readFile(filePath, 'utf8')).toBe(contents);
  });

  it('keeps the previous snapshot on failed replacement, cleans up and allows retry', async () => {
    const c = await container();
    const before = await fs.readFile(filePath, 'utf8');
    const failure = new Error('Disk failure');
    vi.mocked(fs.rename).mockRejectedValueOnce(failure);
    await expect(c.repo.record(purchase('retry'))).rejects.toThrow(failure);
    expect(await fs.readFile(filePath, 'utf8')).toBe(before);
    expect(await fs.readdir(dirname(filePath))).toEqual(['data.json']);
    expect(await c.repo.purchase('medicity#retry')).toBeUndefined();
    expect(await c.repo.history(ci, 'liga-ahorro')).toEqual([]);
    expect(await c.repo.record(purchase('retry'))).toBe(true);
    expect((await c.repo.history(ci, 'liga-ahorro'))[0]?.totalCents).toBe(300);
    await expect(
      c.repo.finalize(
        'missing',
        {
          purchase: {
            purchaseId: 'missing',
            amountCents: 300,
            purchasedAt: now.toISOString(),
            monthKey: '2026-10',
          },
          customer: {
            ci,
            emailMasked: null,
            registeredAt: now.toISOString(),
            registeredNow: false,
          },
          progress: [],
          newRewards: [],
          receipt: { message: '', lines: [] },
        },
        [],
      ),
    ).rejects.toThrow('Missing purchase');
    expect(await c.repo.customer(ci)).toBeUndefined();
  });

  it('propagates filesystem read errors instead of treating the file as a new database', async () => {
    await fs.mkdir(filePath, { recursive: true });
    await expect(new JsonRepositories(filePath).customer(ci)).rejects.toMatchObject({
      code: 'EISDIR',
    });
  });

  it('accepts JSON only locally and requires a nonempty data path', () => {
    expect(env().DATA_FILE).toBe(filePath);
    expect(env({ DATA_FILE: undefined }).DATA_FILE).toBe('.data/smartclub.json');
    expect(() => env({ DATA_FILE: '  ' })).toThrow();
    for (const stage of ['dev', 'prod'])
      expect(() => env({ STAGE: stage })).toThrow('JSON es solo para desarrollo local');
  });
});
