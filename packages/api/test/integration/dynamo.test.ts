import { describe, it, expect, beforeAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { PROGRAM, localTableNames, makeValidCi } from '@club/shared';
import { setupTables } from '../../scripts/setup-local-tables';
import { DynamoRepositories, documentClient } from '../../src/repositories/dynamo';
import { createContainer } from '../../src/container';
import { readEnv } from '../../src/config/env';
const endpoint = process.env.DYNAMODB_ENDPOINT;
describe.skipIf(!endpoint)('DynamoDB Local integration', () => {
  const tables = Object.fromEntries(
    Object.entries(localTableNames()).map(([key, name]) => [key, name + '-' + randomUUID()]),
  ) as ReturnType<typeof localTableNames>;
  let c: Awaited<ReturnType<typeof createContainer>>;
  beforeAll(async () => {
    await setupTables(endpoint ?? '', tables);
    const repo = new DynamoRepositories(documentClient(endpoint), tables);
    await repo.seed(PROGRAM.businesses, PROGRAM.streaks);
    c = await createContainer(
      readEnv({
        STAGE: 'local',
        DATA_DRIVER: 'dynamodb',
        JWT_SECRET: 'obviously-fake-integration-jwt-secret',
        POS_API_KEY: 'obviously-fake-integration-pos-key',
        ...tables,
        DYNAMODB_ENDPOINT: endpoint,
        LOG_LEVEL: 'silent',
      }),
      { repo, clock: { now: () => new Date('2026-10-08T17:00Z') } },
    );
  }, 30000);
  it('round-trips tables and produces exactly one Bronze reward for ten parallel purchases', async () => {
    const ci = '1700000001';
    await c.customers.register({ ci, email: 'integration@example.com', channel: 'POS' }, true);
    await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        c.purchases.record(
          { ci, transactionId: `parallel-${i}`, amountCents: 300, receiptWidth: 40 },
          'farmacias-economicas',
        ),
      ),
    );
    expect((await c.repo.history(ci, 'liga-ahorro'))[0]).toMatchObject({
      totalCents: 3000,
      purchaseCount: 10,
    });
    expect(await c.repo.rewards(ci)).toHaveLength(1);
    expect(await c.repo.customer(ci)).toMatchObject({ email: 'integration@example.com' });
    expect(await c.repo.businesses()).toHaveLength(5);
    expect(await c.repo.streaks()).toHaveLength(2);
    const wallet = await c.repo.rewards(ci);
    const reward = wallet[0];
    if (!reward) throw new Error();
    expect((await c.repo.rewardByCode(reward.code))?.code).toBe(reward.code);
    expect(await c.repo.putReward(reward)).toBe(false);
    expect(await c.repo.createCustomer(await c.customers.require(ci))).toBe(false);
    await c.rewards.redeem(reward.code, 'farmacias-economicas', undefined, undefined, 5000);
    await expect(
      c.rewards.redeem(reward.code, 'farmacias-economicas', undefined, undefined, 5000),
    ).rejects.toMatchObject({
      extra: { reason: 'ALREADY_REDEEMED' },
    });
  }, 30000);
  it('round-trips a customer without email and retains explicit verbal consent', async () => {
    const ci = '1700000035';
    await c.customers.register({ ci, channel: 'POS' }, true);
    const r = await c.repo.customer(ci);
    expect(r).not.toHaveProperty('email');
    expect(r?.consent.channel).toBe('POS_VERBAL');
  });
  it('counts a parallel replay once and returns identical responses', async () => {
    const ci = '1700000019';
    await c.customers.register({ ci, email: 'replay@example.com', channel: 'POS' }, true);
    const input = { ci, transactionId: 'same', amountCents: 1800, receiptWidth: 40 as const };
    const r = await Promise.all(
      Array.from({ length: 10 }, () => c.purchases.record(input, 'farmacias-economicas')),
    );
    expect((await c.repo.history(ci, 'liga-ahorro'))[0]).toMatchObject({
      totalCents: 1800,
      purchaseCount: 1,
    });
    for (const item of r) expect(item.result).toEqual(r[0]?.result);
    expect((await c.repo.purchases(ci)).items).toHaveLength(1);
    expect(await c.repo.rewards(ci)).toHaveLength(1);
    await expect(c.repo.purchases(ci, 'invalid')).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
    await expect(
      c.repo.purchases(ci, Buffer.from(JSON.stringify({ ci: 'wrong' })).toString('base64url')),
    ).rejects.toThrow();
  }, 30000);
  it('paginates purchases and chooses with a conditional write', async () => {
    const ci = makeValidCi('170000020');
    await c.customers.register({ ci, email: 'pages@example.com', channel: 'POS' }, true);
    for (let i = 0; i < 21; i++)
      await c.purchases.record(
        { ci, transactionId: `page-${i}`, amountCents: 10, receiptWidth: 32 },
        'farmacias-economicas',
      );
    const first = await c.repo.purchases(ci);
    expect(first.items).toHaveLength(20);
    expect(first.cursor).toBeTruthy();
    expect((await c.repo.purchases(ci, first.cursor)).items).toHaveLength(1);
    expect(
      await c.repo.updateReward(
        {
          ci,
          rewardInstanceId: 'missing',
          code: 'ECO-00000000',
          status: 'REDEEMED',
          streakId: 'test',
          monthKey: '2026-10',
          tierId: 'BRONZE',
          rewardId: 'test',
          installment: 0,
          validFrom: '',
          expiresAt: '',
          issuedAt: '',
          issuedByPurchaseId: '',
        },
        'AVAILABLE',
      ),
    ).toBe(false);
  }, 30000);
});
