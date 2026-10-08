import { createHash, timingSafeEqual } from 'node:crypto';
import type { RequestHandler } from 'express';
import type { Container } from '../container';
import { AppError } from '../lib/errors';
export function requireCustomer(c: Container): RequestHandler {
  return async (req, res, next) => {
    try {
      const header = req.header('authorization');
      if (!header?.startsWith('Bearer ')) throw new Error('Missing token');
      const ci = await c.sessions.verify(header.slice(7), c.clock.now());
      res.locals.customer = await c.customers.require(ci);
      next();
    } catch {
      next(new AppError(401, 'UNAUTHENTICATED', 'Ingresa de nuevo para continuar'));
    }
  };
}
export function requirePos(c: Container): RequestHandler {
  return async (req, res, next) => {
    const key = req.header('x-api-key') ?? '';
    const hash = (s: string) => createHash('sha256').update(s).digest();
    if (!key || !timingSafeEqual(hash(key), hash(c.posKey)))
      throw new AppError(401, 'INVALID_POS_KEY', 'Clave de caja incorrecta');
    const { businesses, streaks } = await c.program.get();
    const b = businesses.find((b) => b.businessId === req.header('x-business-id'));
    if (!b || !streaks.some((s) => s.businessIds.includes(b.businessId)))
      throw new AppError(403, 'BUSINESS_NOT_ALLOWED', 'El negocio no participa en el programa');
    res.locals.business = b;
    next();
  };
}
