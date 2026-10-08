import express from 'express';
import type { ErrorRequestHandler } from 'express';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import { randomUUID } from 'node:crypto';
import {
  registrationSchema,
  loginSchema,
  posCustomerSchema,
  posProgressSchema,
  purchaseSchema,
  chooseSchema,
  codeSchema,
  redeemSchema,
  historySchema,
  rewardDto,
} from '@club/shared';
import type { Customer, BusinessDefinition } from '@club/shared';
import type { Container } from './container';
import { AppError } from './lib/errors';
import { validate } from './middleware/validate';
import { requireCustomer, requirePos } from './middleware/auth';
import { customerDto } from './services/customer-service';
export function createApp(c: Container) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', true);
  app.use(helmet());
  app.use(
    pinoHttp({
      logger: c.logger,
      genReqId: (_req, res) => {
        const id = randomUUID();
        res.setHeader('x-request-id', id);
        return id;
      },
      serializers: {
        req: (r) => ({ requestId: (r as { id: string }).id }),
        res: (r) => ({ statusCode: (r as { statusCode: number }).statusCode }),
      },
      customErrorObject: () => ({ error: 'request_failed' }),
    }),
  );
  app.use(express.json({ limit: '10kb' }));
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', tenant: c.tenant.id, version: '1.0.0' });
  });
  app.get('/api/program', async (_req, res) => {
    const { streaks, businesses } = await c.program.get();
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.json({
      tenant: {
        id: c.tenant.id,
        displayName: c.tenant.displayName,
        leagueName: c.tenant.leagueName,
        tagline: c.tenant.tagline,
      },
      streaks,
      businesses,
    });
  });
  app.post('/api/auth/register', async (req, res) => {
    const input = validate(registrationSchema, req.body as unknown);
    if (
      input.source?.businessId &&
      !(await c.program.get()).businesses.some((b) => b.businessId === input.source?.businessId)
    )
      throw new AppError(400, 'VALIDATION_ERROR', 'Negocio desconocido');
    const { customer } = await c.customers.register({
      ci: input.ci,
      email: input.email,
      channel:
        input.source?.channel === 'QR'
          ? 'WEB_QR'
          : input.source?.channel === 'SOCIAL'
            ? 'WEB_SOCIAL'
            : 'WEB_DIRECT',
      businessId: input.source?.businessId,
    });
    res.status(201).json({
      token: await c.sessions.issue(customer.ci, c.clock.now()),
      customer: customerDto(customer),
    });
  });
  app.post('/api/auth/login', async (req, res) => {
    const { ci } = validate(loginSchema, req.body as unknown);
    const customer = await c.customers.require(ci);
    res.json({ token: await c.sessions.issue(ci, c.clock.now()), customer: customerDto(customer) });
  });
  const me = express.Router();
  me.use(requireCustomer(c));
  const ci = (res: express.Response) => (res.locals.customer as Customer).ci;
  me.get('/', (_req, res) => {
    res.json(customerDto(res.locals.customer as Customer));
  });
  me.get('/progress', async (_req, res) => {
    res.json({ progress: (await c.progress.get(ci(res))).progress });
  });
  me.get('/history', async (req, res) => {
    const { months } = validate(historySchema, req.query);
    res.json(await c.progress.history(ci(res), months));
  });
  me.get('/purchases', async (req, res) => {
    if (req.query.cursor !== undefined && typeof req.query.cursor !== 'string')
      throw new AppError(400, 'VALIDATION_ERROR', 'Cursor inválido');
    const r = await c.repo.purchases(ci(res), req.query.cursor);
    res.json({
      items: r.items.map((p) => ({
        purchaseId: p.purchaseId,
        businessId: p.businessId,
        amountCents: p.amountCents,
        purchasedAt: p.purchasedAt,
        monthKey: p.monthKey,
      })),
      cursor: r.cursor,
    });
  });
  me.get('/rewards', async (_req, res) => {
    res.json(await c.rewards.wallet(ci(res)));
  });
  me.post('/rewards/:code/choose', async (req, res) => {
    const { benefitId } = validate(chooseSchema, req.body as unknown);
    const { code } = validate(codeSchema, { code: req.params.code });
    res.json(await c.rewards.choose(ci(res), code, benefitId));
  });
  app.use('/api/me', me);
  const pos = express.Router();
  pos.use(requirePos(c));
  const business = (res: express.Response) =>
    (res.locals.business as BusinessDefinition).businessId;
  pos.post('/customers', async (req, res) => {
    const input = validate(posCustomerSchema, req.body as unknown);
    const r = await c.customers.register(
      { ...input, channel: 'POS', businessId: business(res) },
      true,
    );
    res
      .status(r.registeredNow ? 201 : 200)
      .json({ customer: customerDto(r.customer), registeredNow: r.registeredNow });
  });
  pos.post('/customers/progress', async (req, res) => {
    const input = validate(posProgressSchema, req.body as unknown);
    await c.customers.require(input.ci);
    res.json(await c.progress.get(input.ci, undefined, input.receiptWidth, [], business(res)));
  });
  pos.post('/purchases', async (req, res) => {
    const input = validate(purchaseSchema, req.body as unknown);
    const r = await c.purchases.record(input, business(res));
    res.status(r.replay ? 200 : 201).json(r.result);
  });
  pos.post('/rewards/lookup', async (req, res) => {
    const { code } = validate(codeSchema, req.body as unknown);
    res.json(rewardDto(await c.rewards.lookup(code), c.clock.now()));
  });
  pos.post('/rewards/redeem', async (req, res) => {
    const { code, transactionId, benefitId } = validate(redeemSchema, req.body as unknown);
    res.json(await c.rewards.redeem(code, business(res), transactionId, benefitId));
  });
  app.use('/api/pos', pos);
  app.use((_req, _res, next) => {
    next(new AppError(404, 'NOT_FOUND', 'No encontramos esta página'));
  });
  const errorHandler: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
    if (error instanceof AppError) {
      res
        .status(error.status)
        .json({ error: { code: error.code, message: error.message, ...error.extra } });
      return;
    }
    if (error instanceof SyntaxError) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'JSON inválido' } });
      return;
    }
    if (error && typeof error === 'object' && 'status' in error && error.status === 413) {
      res
        .status(413)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Solicitud demasiado grande' } });
      return;
    }
    c.logger.error(
      { errorType: error instanceof Error ? error.name : 'Unknown' },
      'Request failed',
    );
    res
      .status(500)
      .json({ error: { code: 'INTERNAL_ERROR', message: 'Ocurrió un error. Intenta de nuevo.' } });
  };
  app.use(errorHandler);
  return app;
}
