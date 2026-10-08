import { describe, it, expect, beforeEach, vi } from 'vitest';
import supertest from 'supertest';
import { SignJWT } from 'jose';
import { PROGRAM, customerRewardDtoSchema, purchaseResultSchema } from '@club/shared';
import type {
  CustomerReward,
  CustomerRewardDto,
  PurchaseResult,
  ProgressSummary,
  HistoryDto,
} from '@club/shared';
import { createContainer } from '../src/container';
import { createApp } from '../src/app';
import { readEnv } from '../src/config/env';
import { seedDemo } from '../src/demo';
import { createLogger } from '../src/lib/logger';
const now = new Date('2026-10-08T17:00:00Z');
const jwt = 'obviously-fake-local-jwt-secret-never-use-in-production';
const posKey = 'obviously-fake-local-pos-key';
const pos = { 'x-api-key': posKey, 'x-business-id': 'farmacias-economicas' };
const otherPos = { ...pos, 'x-business-id': 'medicity' };
const ci = '1700000035';
let c: Awaited<ReturnType<typeof createContainer>>;
let api: ReturnType<typeof supertest>;
beforeEach(async () => {
  c = await createContainer(
    readEnv({ DATA_DRIVER: 'memory', JWT_SECRET: jwt, POS_API_KEY: posKey, LOG_LEVEL: 'silent' }),
    { clock: { now: () => now } },
  );
  api = supertest(createApp(c));
});
async function reward(patch: Partial<CustomerReward> = {}) {
  const r: CustomerReward = {
    ci,
    streakId: 'liga-ahorro',
    rewardInstanceId: 'fixture',
    code: 'SC-00000000',
    status: 'AVAILABLE',
    tierId: 'BRONZE',
    rewardId: 'bronce-cashback',
    monthKey: '2026-10',
    benefit: required(required(required(PROGRAM.streaks[0]).tiers[0]).rewards[0]).benefits[0],
    installment: 0,
    validFrom: '2026-10-01T05:00:00Z',
    expiresAt: '2026-11-01T04:59:59Z',
    issuedAt: now.toISOString(),
    issuedByPurchaseId: 'fixture',
    ...patch,
  };
  await c.repo.putReward(r);
  return r;
}
describe('single program and explicit consent', () => {
  it.each([undefined, '', '  '])('registers without email (%s)', async (email) => {
    const r = await api.post('/api/auth/register').send({ ci, email, acceptPrivacyPolicy: true });
    expect(r.status).toBe(201);
    expect(
      (r.body as { customer: { emailMasked: string | null } }).customer.emailMasked,
    ).toBeNull();
    expect(await c.repo.customer(ci)).not.toHaveProperty('email');
    const token = (r.body as { token: string }).token;
    expect((await api.get('/api/me').auth(token, { type: 'bearer' })).body).toMatchObject({
      emailMasked: null,
    });
  });
  it('rejects invalid email and assisted registration without consent', async () => {
    expect(
      (
        await api
          .post('/api/auth/register')
          .send({ ci, email: 'invalid', acceptPrivacyPolicy: true })
      ).status,
    ).toBe(400);
    expect((await api.post('/api/pos/customers').set(pos).send({ ci })).status).toBe(400);
    expect(
      (await api.post('/api/pos/customers').set(pos).send({ ci, acceptPrivacyPolicy: true }))
        .status,
    ).toBe(201);
    expect(
      (
        await api
          .post('/api/pos/customers')
          .set(pos)
          .send({ ci, email: 'later@example.com', acceptPrivacyPolicy: true })
      ).status,
    ).toBe(200);
    expect((await c.repo.customer(ci))?.email).toBeUndefined();
  });
  it('requires purchase registration with explicit consent and strips legacy email', async () => {
    const body = { ci, transactionId: 'first', amountCents: 1000 };
    for (const patch of [{}, { email: 'legacy@example.com' }]) {
      const r = await api
        .post('/api/pos/purchases')
        .set(pos)
        .send({ ...body, ...patch });
      expect(r.status).toBe(404);
    }
    expect(await c.repo.customer(ci)).toBeUndefined();
    expect(
      (
        await api
          .post('/api/pos/purchases')
          .set(pos)
          .send({ ...body, registration: { acceptPrivacyPolicy: false } })
      ).status,
    ).toBe(400);
    const r = await api
      .post('/api/pos/purchases')
      .set(pos)
      .send({ ...body, registration: { acceptPrivacyPolicy: true } });
    expect(r.status).toBe(201);
    expect(purchaseResultSchema.safeParse(r.body).success).toBe(true);
    expect((r.body as PurchaseResult).customer).toMatchObject({
      registeredNow: true,
      emailMasked: null,
    });
    expect((await c.repo.customer(ci))?.consent.channel).toBe('POS_VERBAL');
    await api
      .post('/api/pos/purchases')
      .set(pos)
      .send({
        ...body,
        transactionId: 'second',
        registration: { acceptPrivacyPolicy: true, email: 'ignored@example.com' },
      });
    expect((await c.repo.customer(ci))?.email).toBeUndefined();
  });
  it('serves both sorted ligas with one login and no tenant fields', async () => {
    await seedDemo(c);
    await api
      .post('/api/pos/purchases')
      .set(pos)
      .send({ ci: '1700000027', transactionId: 'ahorro-threshold', amountCents: 200 });
    const login = await api.post('/api/auth/login').send({ ci: '1700000027' });
    const token = (login.body as { token: string }).token;
    const p = await api.get('/api/me/progress').auth(token, { type: 'bearer' });
    expect(
      (p.body as { progress: ProgressSummary[] }).progress.map((s) => [s.streakId, s.totalCents]),
    ).toEqual([
      ['liga-ahorro', 1000],
      ['liga-wellness', 10000],
    ]);
    const h = (await api.get('/api/me/history').auth(token, { type: 'bearer' })).body as HistoryDto;
    expect(h.ligas.map((s) => s.streakId)).toEqual(['liga-ahorro', 'liga-wellness']);
    expect(h.ligas.every((s) => s.months.length === 6)).toBe(true);
    const rewards = (await api.get('/api/me/rewards').auth(token, { type: 'bearer' }))
      .body as CustomerRewardDto[];
    expect(new Set(rewards.map((r) => r.streakId))).toEqual(
      new Set(['liga-ahorro', 'liga-wellness']),
    );
    expect(
      rewards.every(
        (r) => r.code.startsWith('SC-') && customerRewardDtoSchema.safeParse(r).success,
      ),
    ).toBe(true);
    expect((await api.get('/api/health')).body).toEqual({
      status: 'ok',
      app: 'smartclub',
      version: '2.0.0',
    });
    const catalog = (await api.get('/api/program')).body as {
      program: { id: string };
      streaks: unknown[];
    };
    expect(catalog).not.toHaveProperty('tenant');
    expect(catalog.program.id).toBe('smartclub');
    expect(catalog.streaks).toHaveLength(2);
  });
  it('chooses a deterministic receipt primary and excludes the other liga rewards', async () => {
    const first = {
      ...structuredClone(required(PROGRAM.streaks[0])),
      streakId: 'liga-extra',
      name: 'Liga Extra',
      displayOrder: 0,
    };
    await c.repo.seed(PROGRAM.businesses, [
      required(PROGRAM.streaks[0]),
      first,
      required(PROGRAM.streaks[1]),
    ]);
    const r = (
      await api
        .post('/api/pos/purchases')
        .set(pos)
        .send({
          ci,
          transactionId: 'shared',
          amountCents: 1000,
          registration: { acceptPrivacyPolicy: true },
        })
    ).body as PurchaseResult;
    expect(r.progress.map((s) => s.streakId)).toEqual(['liga-extra', 'liga-ahorro']);
    expect(r.newRewards).toHaveLength(2);
    expect(r.receipt.lines[1]?.trim()).toBe('SMARTCLUB - LIGA EXTRA');
    const primary = required(r.newRewards.find((r) => r.streakId === first.streakId));
    const other = required(r.newRewards.find((r) => r.streakId !== first.streakId));
    expect(r.receipt.message).toContain(primary.code);
    expect(r.receipt.message).not.toContain(other.code);
  });
  it.each([{}, { tid: 'legacy' }])('rejects JWTs without issuer/audience', async (claims) => {
    await c.customers.register({ ci, channel: 'WEB_DIRECT' });
    const token = await new SignJWT(claims)
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(ci)
      .setExpirationTime(Math.floor(now.getTime() / 1000) + 100)
      .sign(new TextEncoder().encode(jwt));
    expect((await api.get('/api/me').auth(token, { type: 'bearer' })).status).toBe(401);
  });
});
describe('capped redemption', () => {
  it('previews without mutation, caps the redemption and persists exact amounts', async () => {
    const r = await reward();
    const preview = await api
      .post('/api/pos/rewards/lookup')
      .set(pos)
      .send({ code: r.code, purchaseAmountCents: 5000 });
    expect(preview.status).toBe(200);
    expect((preview.body as CustomerRewardDto).discount).toEqual({
      purchaseAmountCents: 5000,
      discountCents: 100,
      capCents: 100,
      capped: true,
    });
    expect((await c.rewards.lookup(r.code)).status).toBe('AVAILABLE');
    const redeemed = await api
      .post('/api/pos/rewards/redeem')
      .set(pos)
      .send({ code: r.code, purchaseAmountCents: 5000 });
    expect(redeemed.status).toBe(200);
    expect((redeemed.body as CustomerRewardDto).discount?.discountCents).toBe(100);
    expect(await c.rewards.lookup(r.code)).toMatchObject({
      redeemedPurchaseAmountCents: 5000,
      appliedDiscountCents: 100,
    });
  });
  it('requires an amount and rejects zero discounts without consuming the code', async () => {
    const r = await reward();
    expect(
      (await api.post('/api/pos/rewards/redeem').set(pos).send({ code: r.code })).body,
    ).toMatchObject({ error: { code: 'PURCHASE_AMOUNT_REQUIRED' } });
    expect(
      (
        await api
          .post('/api/pos/rewards/redeem')
          .set(pos)
          .send({ code: r.code, purchaseAmountCents: 19 })
      ).body,
    ).toMatchObject({ error: { reason: 'PURCHASE_TOO_SMALL' } });
    for (const amount of [0, -1, 1.5, 1_000_001])
      expect(
        (
          await api
            .post('/api/pos/rewards/redeem')
            .set(pos)
            .send({ code: r.code, purchaseAmountCents: amount })
        ).status,
      ).toBe(400);
    expect((await c.rewards.lookup(r.code)).status).toBe('AVAILABLE');
  });
  it('checks liga scope before amount and honors narrower benefit scopes', async () => {
    const r = await reward();
    expect(
      (await api.post('/api/pos/rewards/redeem').set(otherPos).send({ code: r.code })).body,
    ).toMatchObject({
      error: { reason: 'WRONG_BUSINESS', details: { redeemableAt: ['farmacias-economicas'] } },
    });
    const narrow = await reward({
      rewardInstanceId: 'narrow',
      code: 'SC-11111111',
      streakId: 'liga-wellness',
      benefit: {
        benefitId: 'fast-track',
        type: 'IN_STORE_PERK',
        title: 'Fast Track',
        description: 'Fast Track',
        businessIds: ['medicity'],
      },
    });
    expect(
      (
        await api
          .post('/api/pos/rewards/redeem')
          .set({ ...pos, 'x-business-id': 'mascotas' })
          .send({ code: narrow.code })
      ).status,
    ).toBe(409);
    expect(
      (
        await api
          .post('/api/pos/rewards/redeem')
          .set(otherPos)
          .send({ code: narrow.code, purchaseAmountCents: 5000 })
      ).status,
    ).toBe(200);
    expect(await c.rewards.lookup(narrow.code)).not.toHaveProperty('appliedDiscountCents');
  });
  it('chooses and discounts atomically only once the ticket amount is present', async () => {
    const r = await reward({
      status: 'PENDING_CHOICE',
      benefit: undefined,
      options: required(required(required(PROGRAM.streaks[0]).tiers[1]).rewards[0]).benefits,
    });
    expect(
      (
        await api
          .post('/api/pos/rewards/redeem')
          .set(pos)
          .send({ code: r.code, benefitId: 'cupon-2' })
      ).status,
    ).toBe(400);
    expect((await c.rewards.lookup(r.code)).status).toBe('PENDING_CHOICE');
    const response = await api
      .post('/api/pos/rewards/redeem')
      .set(pos)
      .send({ code: r.code, benefitId: 'cupon-2', purchaseAmountCents: 150 });
    expect((response.body as CustomerRewardDto).discount).toMatchObject({
      discountCents: 150,
      capped: false,
    });
    expect((await c.rewards.lookup(r.code)).status).toBe('REDEEMED');
  });
  it.each(['ECO', 'FRM'])('uses current cap for legacy %s snapshots', async (prefix) => {
    const b = {
      ...required(required(required(required(PROGRAM.streaks[0]).tiers[0]).rewards[0]).benefits[0]),
    };
    delete b.maxDiscountCents;
    const r = await reward({ code: `${prefix}-00000000`, benefit: b });
    const lookup = await api
      .post('/api/pos/rewards/lookup')
      .set(pos)
      .send({ code: r.code, purchaseAmountCents: 5000 });
    expect((lookup.body as CustomerRewardDto).benefit?.maxDiscountCents).toBe(100);
    const redeemed = await api
      .post('/api/pos/rewards/redeem')
      .set(pos)
      .send({ code: r.code, purchaseAmountCents: 5000 });
    expect(redeemed.status).toBe(200);
    expect((redeemed.body as CustomerRewardDto).discount?.discountCents).toBe(100);
  });
  it('fails closed and logs only the invalid snapshot message when no cap is defined', async () => {
    const b = {
      ...required(required(required(required(PROGRAM.streaks[0]).tiers[0]).rewards[0]).benefits[0]),
    };
    delete b.maxDiscountCents;
    const r = await reward({ rewardId: 'unknown', benefit: b });
    expect(
      (await api.post('/api/pos/rewards/redeem').set(pos).send({ code: r.code })).body,
    ).toMatchObject({ error: { code: 'PURCHASE_AMOUNT_REQUIRED' } });
    let logs = '';
    const logger = createLogger('info', {
      write: (s) => {
        logs += s;
      },
    });
    const logging = await createContainer(c.env, { repo: c.repo, clock: c.clock, logger });
    const response = await supertest(createApp(logging))
      .post('/api/pos/rewards/redeem')
      .set(pos)
      .send({ code: r.code, purchaseAmountCents: 5000 });
    expect(response.status).toBe(500);
    expect(logs).toContain('invalid reward snapshot');
    expect(logs).not.toContain(ci);
    expect((await c.rewards.lookup(r.code)).status).toBe('AVAILABLE');
  });
  it('allows exactly one concurrent discount redemption', async () => {
    const r = await reward();
    const responses = await Promise.all(
      [1, 2].map(() =>
        api
          .post('/api/pos/rewards/redeem')
          .set(pos)
          .send({ code: r.code, purchaseAmountCents: 5000 }),
      ),
    );
    expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
  });
  it('does not require a ticket for services or leak unknown rewards', async () => {
    const r = await reward({
      benefit: {
        benefitId: 'delivery',
        type: 'FREE_DELIVERY',
        title: 'Envío',
        description: 'Envío',
      },
    });
    expect(
      (await api.post('/api/pos/rewards/lookup').set(pos).send({ code: r.code })).body,
    ).not.toHaveProperty('discount');
    expect((await api.post('/api/pos/rewards/redeem').set(pos).send({ code: r.code })).status).toBe(
      200,
    );
    expect(
      (await api.post('/api/pos/rewards/redeem').set(pos).send({ code: 'SC-ZZZZZZZZ' })).status,
    ).toBe(404);
    vi.spyOn(c.repo, 'updateReward').mockResolvedValue(false);
    await reward({
      rewardInstanceId: 'pending',
      code: 'SC-11111111',
      status: 'PENDING_CHOICE',
      options: [{ benefitId: 'one', type: 'IN_STORE_PERK', title: 'Café', description: 'Café' }],
    });
    await expect(c.rewards.choose(ci, 'SC-11111111', 'one')).rejects.toMatchObject({
      code: 'REWARD_ALREADY_CHOSEN',
    });
  });
});

function required<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('Missing test fixture');
  return value;
}
