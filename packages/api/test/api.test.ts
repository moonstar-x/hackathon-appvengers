import { beforeEach, describe, it, expect, vi } from 'vitest';
import supertest from 'supertest';
import { SignJWT } from 'jose';
import {
  TENANTS,
  makeValidCi,
  authResponseSchema,
  purchaseResultSchema,
  programDtoSchema,
} from '@club/shared';
import type { PurchaseResult, CustomerReward } from '@club/shared';
import { createApp } from '../src/app';
import { createContainer } from '../src/container';
import { readEnv } from '../src/config/env';
import { createLogger } from '../src/lib/logger';
import { seedDemo } from '../src/demo';
import { MemoryRepositories } from '../src/repositories/memory';
import { Sessions } from '../src/lib/jwt';
import { getSecret } from '../src/lib/secrets';
vi.mock('@aws-sdk/client-secrets-manager', () => ({
  SecretsManagerClient: class {
    send() {
      return Promise.resolve({ SecretString: 'test-secret-value' });
    }
  },
  GetSecretValueCommand: class {
    constructor(public readonly input: unknown) {}
  },
}));
const key = 'obviously-fake-local-pos-key';
const jwt = 'obviously-fake-local-jwt-secret-never-use-in-production';
const date = new Date('2026-10-08T17:00:00Z');
const env = () =>
  readEnv({
    TENANT_ID: 'ecoclub',
    STAGE: 'local',
    DATA_DRIVER: 'memory',
    JWT_SECRET: jwt,
    POS_API_KEY: key,
    LOG_LEVEL: 'silent',
  });
let c: Awaited<ReturnType<typeof createContainer>>;
let api: ReturnType<typeof supertest>;
const headers = { 'x-api-key': key, 'x-business-id': 'farmacias-economicas' };
const ci = '1700000035';
const error = (r: supertest.Response) =>
  (r.body as { error: { code: string; reason?: string } }).error;
async function register() {
  const r = await api
    .post('/api/auth/register')
    .send({ ci, email: ' TEST@EXAMPLE.COM ', acceptPrivacyPolicy: true });
  expect(authResponseSchema.safeParse(r.body).success).toBe(true);
  return (r.body as { token: string }).token;
}
beforeEach(async () => {
  c = await createContainer(env(), { clock: { now: () => date } });
  api = supertest(createApp(c));
});
describe('customer authentication and safe responses', () => {
  it('registers with consent, normalizes email and rejects duplicates', async () => {
    const token = await register();
    expect(token).toBeTruthy();
    const stored = await c.repo.customer(ci);
    expect(stored?.email).toBe('test@example.com');
    expect(stored?.consent.channel).toBe('WEB_CHECKBOX');
    const me = await api.get('/api/me').auth(token, { type: 'bearer' });
    expect(me.status).toBe(200);
    expect(JSON.stringify(me.body)).not.toContain('test@example.com');
    expect(
      error(
        await api
          .post('/api/auth/register')
          .send({ ci, email: 'x@example.com', acceptPrivacyPolicy: true }),
      ).code,
    ).toBe('CUSTOMER_EXISTS');
    expect(
      error(
        await api
          .post('/api/auth/register')
          .send({ ci: '1700000002', email: 'x@example.com', acceptPrivacyPolicy: true }),
      ).code,
    ).toBe('INVALID_CI');
    expect(
      error(await api.post('/api/auth/register').send({ ci, email: 'x@example.com' })).code,
    ).toBe('VALIDATION_ERROR');
  });
  it('handles login, missing/expired/wrong-tenant sessions', async () => {
    expect((await api.post('/api/auth/login').send({ ci })).status).toBe(404);
    await register();
    expect((await api.post('/api/auth/login').send({ ci })).status).toBe(200);
    expect((await api.get('/api/me')).status).toBe(401);
    const wrong = await new SignJWT({ tid: 'farmaclub' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(ci)
      .setExpirationTime('30d')
      .sign(new TextEncoder().encode(jwt));
    expect((await api.get('/api/me').auth(wrong, { type: 'bearer' })).status).toBe(401);
    const missing = await c.sessions.issue('0900000001', date);
    expect((await api.get('/api/me').auth(missing, { type: 'bearer' })).status).toBe(401);
    const expired = await c.sessions.issue(ci, new Date('2020-01-01'));
    expect((await api.get('/api/me').auth(expired, { type: 'bearer' })).status).toBe(401);
    await expect(
      new Sessions(jwt, 'ecoclub').verify(
        await new SignJWT({ tid: 'ecoclub' })
          .setProtectedHeader({ alg: 'HS256' })
          .sign(new TextEncoder().encode(jwt)),
        date,
      ),
    ).rejects.toThrow();
  });
  it('records QR attribution and rejects unknown businesses', async () => {
    const body = {
      ci,
      email: 'qr@example.com',
      acceptPrivacyPolicy: true,
      source: { channel: 'QR', businessId: 'farmacias-economicas' },
    };
    expect((await api.post('/api/auth/register').send(body)).status).toBe(201);
    expect((await c.repo.customer(ci))?.registrationChannel).toBe('WEB_QR');
    expect(
      (
        await api
          .post('/api/auth/register')
          .send({ ...body, ci: '1700000043', source: { channel: 'QR', businessId: 'unknown' } })
      ).status,
    ).toBe(400);
  });
});
describe('POS purchases', () => {
  it('rejects missing/wrong key and unapproved businesses', async () => {
    for (const h of [{}, { ...headers, 'x-api-key': 'bad' }])
      expect((await api.post('/api/pos/purchases').set(h).send({})).status).toBe(401);
    expect(
      (
        await api
          .post('/api/pos/purchases')
          .set({ ...headers, 'x-business-id': 'unknown' })
          .send({})
      ).status,
    ).toBe(403);
    const inactive = TENANTS.ecoclub.businesses[0];
    if (!inactive) throw new Error('Missing fixture business');
    await c.repo.seed([{ ...inactive, active: false }], [TENANTS.ecoclub.streak]);
    vi.spyOn(c.clock, 'now').mockReturnValue(new Date(date.getTime() + 61000));
    expect(
      (await api.post('/api/pos/customers').set(headers).send({ ci, email: 'x@example.com' }))
        .status,
    ).toBe(403);
  });
  it('creates assisted customers idempotently without replacing their email', async () => {
    const a = await api
      .post('/api/pos/customers')
      .set(headers)
      .send({ ci, email: 'first@example.com' });
    expect(a.status).toBe(201);
    const b = await api
      .post('/api/pos/customers')
      .set(headers)
      .send({ ci, email: 'second@example.com' });
    expect(b.status).toBe(200);
    expect((await c.repo.customer(ci))?.email).toBe('first@example.com');
    expect((await c.repo.customer(ci))?.consent.channel).toBe('POS_VERBAL');
  });
  it('auto-registers, unlocks precisely at threshold and preserves replay results', async () => {
    const first = { ci, email: 'auto@example.com', transactionId: 'sale-1', amountCents: 999 };
    const a = await api.post('/api/pos/purchases').set(headers).send(first);
    expect(a.status).toBe(201);
    expect((a.body as PurchaseResult).newRewards).toHaveLength(0);
    const b = await api
      .post('/api/pos/purchases')
      .set(headers)
      .send({ ci, transactionId: 'sale-2', amountCents: 1 });
    expect(b.status).toBe(201);
    expect(purchaseResultSchema.safeParse(b.body).success).toBe(true);
    expect((b.body as PurchaseResult).newRewards).toHaveLength(1);
    expect((b.body as PurchaseResult).receipt.lines.length).toBeGreaterThan(5);
    const replay = await api.post('/api/pos/purchases').set(headers).send(first);
    expect(replay.status).toBe(200);
    expect(replay.body).toEqual(a.body);
    expect(
      error(
        await api
          .post('/api/pos/purchases')
          .set(headers)
          .send({ ...first, amountCents: 5 }),
      ).code,
    ).toBe('TRANSACTION_CONFLICT');
    expect(
      error(
        await api
          .post('/api/pos/purchases')
          .set(headers)
          .send({ ...first, ci: '1700000043' }),
      ).code,
    ).toBe('TRANSACTION_CONFLICT');
    expect((await c.repo.history(ci, 'liga-ahorro'))[0]?.totalCents).toBe(1000);
  });
  it('validates windows and handles unknown customers', async () => {
    expect(
      error(
        await api
          .post('/api/pos/purchases')
          .set(headers)
          .send({ ci, transactionId: 'x', amountCents: 100 }),
      ).code,
    ).toBe('CUSTOMER_NOT_FOUND');
    await register();
    for (const purchasedAt of ['2026-10-05T16:59:59Z', '2026-10-08T17:05:01Z'])
      expect(
        error(
          await api
            .post('/api/pos/purchases')
            .set(headers)
            .send({ ci, transactionId: 'x', amountCents: 100, purchasedAt }),
        ).code,
      ).toBe('PURCHASE_OUT_OF_WINDOW');
    expect(
      (
        await api
          .post('/api/pos/purchases')
          .set(headers)
          .send({ ci, transactionId: 'x', amountCents: 100, purchasedAt: '2026-10-08T17:05:00Z' })
      ).status,
    ).toBe(201);
  });
  it('accumulates parallel purchases and issues once in memory', async () => {
    await register();
    const responses = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        c.purchases.record(
          { ci, transactionId: `parallel-${i}`, amountCents: 300, receiptWidth: 40 },
          'farmacias-economicas',
        ),
      ),
    );
    expect(responses.every((r) => !r.replay)).toBe(true);
    expect((await c.repo.history(ci, 'liga-ahorro'))[0]).toMatchObject({
      totalCents: 3000,
      purchaseCount: 10,
    });
    expect(await c.repo.rewards(ci)).toHaveLength(1);
  });
});
describe('progress and demo reward choice', () => {
  it('serves dashboard, zero-filled history, purchase pages and reprint', async () => {
    await seedDemo(c);
    const login = await api.post('/api/auth/login').send({ ci: '1700000001' });
    const token = (login.body as { token: string }).token;
    const auth = { Authorization: 'Bearer ' + token };
    const progress = await api.get('/api/me/progress').set(auth);
    expect(progress.status).toBe(200);
    expect(JSON.stringify(progress.body)).toContain('AT_RISK');
    const history = await api.get('/api/me/history?months=6').set(auth);
    expect(history.body as unknown[]).toHaveLength(6);
    expect((await api.get('/api/me/history?months=13').set(auth)).status).toBe(400);
    expect((await api.get('/api/me/purchases').set(auth)).status).toBe(200);
    expect((await api.get('/api/me/purchases?cursor=x&cursor=y').set(auth)).status).toBe(400);
    expect((await api.get('/api/me/rewards').set(auth)).status).toBe(200);
    expect(
      (
        await api
          .post('/api/pos/customers/progress')
          .set(headers)
          .send({ ci: '1700000001', receiptWidth: 32 })
      ).status,
    ).toBe(200);
  });
  it('unlocks the demo Silver choice and redeems it exactly once', async () => {
    await seedDemo(c);
    const r = await api
      .post('/api/pos/purchases')
      .set(headers)
      .send({ ci: '1700000001', amountCents: 300, transactionId: 'demo-moment' });
    const choice = (r.body as PurchaseResult).newRewards.find((r) => r.status === 'PENDING_CHOICE');
    expect(choice).toBeDefined();
    const code = choice?.code ?? '';
    const token = (await api.post('/api/auth/login').send({ ci: '1700000001' })).body as {
      token: string;
    };
    expect(
      (
        await api
          .post('/api/me/rewards/' + code + '/choose')
          .auth(token.token, { type: 'bearer' })
          .send({ benefitId: 'cupon-2' })
      ).status,
    ).toBe(200);
    expect(
      error(
        await api
          .post('/api/me/rewards/' + code + '/choose')
          .auth(token.token, { type: 'bearer' })
          .send({ benefitId: 'acceso' }),
      ).code,
    ).toBe('REWARD_ALREADY_CHOSEN');
    expect((await api.post('/api/pos/rewards/lookup').set(headers).send({ code })).status).toBe(
      200,
    );
    expect((await api.post('/api/pos/rewards/redeem').set(headers).send({ code })).status).toBe(
      200,
    );
    expect(
      error(await api.post('/api/pos/rewards/redeem').set(headers).send({ code })).reason,
    ).toBe('ALREADY_REDEEMED');
  });
});
describe('redemption guards', () => {
  async function reward(patch: Partial<CustomerReward> = {}) {
    const base: CustomerReward = {
      ci,
      rewardInstanceId: 'test',
      code: 'ECO-00000000',
      status: 'AVAILABLE',
      streakId: 'liga-ahorro',
      monthKey: '2026-10',
      tierId: 'GOLD',
      rewardId: 'test',
      benefit: { benefitId: 'test', type: 'IN_STORE_PERK', title: 'Test', description: 'Test' },
      installment: 0,
      validFrom: '2026-10-01T05:00:00Z',
      expiresAt: '2026-11-01T04:59:59Z',
      issuedAt: date.toISOString(),
      issuedByPurchaseId: 'test',
      ...patch,
    };
    await c.repo.putReward(base);
    return base;
  }
  it.each([
    ['EXPIRED', { expiresAt: '2026-10-01T00:00Z' }],
    ['NOT_YET_VALID', { validFrom: '2026-10-20T00:00Z' }],
    ['PENDING_CHOICE', { status: 'PENDING_CHOICE' }],
    ['ALREADY_REDEEMED', { status: 'REDEEMED' }],
    [
      'WRONG_BUSINESS',
      {
        benefit: {
          benefitId: 'test',
          type: 'IN_STORE_PERK',
          title: 'Test',
          description: 'Test',
          businessIds: ['medicity'],
        },
      },
    ],
  ] as const)('rejects %s', async (reason, patch) => {
    await reward(patch as Partial<CustomerReward>);
    expect(
      error(await api.post('/api/pos/rewards/redeem').set(headers).send({ code: 'ECO-00000000' }))
        .reason,
    ).toBe(reason);
  });
  it('lets a cashier choose at redemption, validates option and ownership', async () => {
    const option = {
      benefitId: 'one',
      type: 'IN_STORE_PERK' as const,
      title: 'Test',
      description: 'Test',
    };
    await reward({ status: 'PENDING_CHOICE', benefit: undefined, options: [option] });
    expect(
      (
        await api
          .post('/api/pos/rewards/redeem')
          .set(headers)
          .send({ code: 'ECO-00000000', benefitId: 'bad' })
      ).status,
    ).toBe(400);
    expect(
      (
        await api
          .post('/api/pos/rewards/redeem')
          .set(headers)
          .send({ code: 'ECO-00000000', benefitId: 'one', transactionId: 'redeem' })
      ).status,
    ).toBe(200);
    expect(
      error(await api.post('/api/pos/rewards/lookup').set(headers).send({ code: 'ECO-11111111' }))
        .code,
    ).toBe('REWARD_NOT_FOUND');
    await register();
    const token = await c.sessions.issue('1700000043', date);
    await c.customers.register({ ci: '1700000043', email: 'x@example.com', channel: 'WEB_DIRECT' });
    expect(
      (
        await api
          .post('/api/me/rewards/ECO-00000000/choose')
          .auth(token, { type: 'bearer' })
          .send({ benefitId: 'one' })
      ).status,
    ).toBe(404);
  });
});
describe('infrastructure boundaries and privacy', () => {
  it('fails fast on bad env and caches secrets', async () => {
    expect(() => readEnv({})).toThrow();
    expect(() => readEnv({ ...env(), PORT: '3000', JWT_SECRET_ARN: 'arn' })).toThrow();
    expect(() => readEnv({ ...env(), PORT: '3000', STAGE: 'prod' })).toThrow();
    expect(() =>
      readEnv({
        ...env(),
        PORT: '3000',
        STAGE: 'prod',
        DATA_DRIVER: 'dynamodb',
        TABLE_CUSTOMERS: undefined,
      }),
    ).toThrow();
    expect(await getSecret('test-arn')).toBe('test-secret-value');
    expect(await getSecret('test-arn')).toBe('test-secret-value');
  });
  it('logs no raw CI/email or credentials, hides internals and handles malformed JSON', async () => {
    let logs = '';
    const logger = createLogger('info', {
      write: (s) => {
        logs += s;
      },
    });
    const repo = new MemoryRepositories();
    const container = await createContainer(
      { ...env(), LOG_LEVEL: 'info' },
      { repo, clock: { now: () => date }, logger },
    );
    const server = supertest(createApp(container));
    await server
      .post('/api/auth/register')
      .send({ ci, email: 'private@example.com', acceptPrivacyPolicy: true });
    expect(logs).not.toContain(ci);
    expect(logs).not.toContain('private@example.com');
    expect(logs).not.toContain(jwt);
    expect(
      (await server.post('/api/auth/login').set('Content-Type', 'application/json').send('{broken'))
        .status,
    ).toBe(400);
    expect((await server.get('/missing')).status).toBe(404);
    expect((await server.get('/api/health')).status).toBe(200);
    const catalog = await server.get('/api/program');
    expect(catalog.headers['cache-control']).toBe('public, max-age=300');
    expect(programDtoSchema.safeParse(catalog.body).success).toBe(true);
    vi.spyOn(repo, 'customer').mockRejectedValue(new Error('private:' + makeValidCi('170000003')));
    const response = await server.post('/api/auth/login').send({ ci });
    expect(response.status).toBe(500);
    expect(JSON.stringify(response.body)).not.toContain('private:');
    expect(logs).not.toContain(ci);
  });
});
