import type { z } from 'zod';
import { AppError } from '../lib/errors';
export function validate<T>(schema: z.ZodType<T>, input: unknown): T {
  const r = schema.safeParse(input);
  if (r.success) return r.data;
  const ci = r.error.issues.some((i) => i.message === 'INVALID_CI');
  throw new AppError(
    400,
    ci ? 'INVALID_CI' : 'VALIDATION_ERROR',
    ci ? 'Revisa tu número de cédula' : 'Revisa los datos ingresados',
    { details: r.error.issues.map(({ path, message, code }) => ({ path, message, code })) },
  );
}
