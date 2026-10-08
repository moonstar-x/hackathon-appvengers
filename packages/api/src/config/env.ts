import { z } from 'zod';
import { localTableNames, TABLE_SPECS } from '@club/shared';
export const envSchema = z
  .object({
    STAGE: z.enum(['local', 'dev', 'prod']).default('local'),
    DATA_DRIVER: z.enum(['dynamodb', 'memory']).default('dynamodb'),
    DYNAMODB_ENDPOINT: z.url().optional(),
    JWT_SECRET: z.string().min(32).optional(),
    JWT_SECRET_ARN: z.string().min(1).optional(),
    POS_API_KEY: z.string().min(16).optional(),
    POS_API_KEY_SECRET_ARN: z.string().min(1).optional(),
    APP_PUBLIC_HOST: z.string().default('localhost:5173'),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    TABLE_BUSINESSES: z.string().optional(),
    TABLE_CUSTOMERS: z.string().optional(),
    TABLE_STREAKS: z.string().optional(),
    TABLE_PROGRESS: z.string().optional(),
    TABLE_PURCHASES: z.string().optional(),
    TABLE_REWARDS: z.string().optional(),
  })
  .superRefine((env, c) => {
    for (const [v, a] of [
      [env.JWT_SECRET, env.JWT_SECRET_ARN],
      [env.POS_API_KEY, env.POS_API_KEY_SECRET_ARN],
    ])
      if (Boolean(v) === Boolean(a))
        c.addIssue({
          code: 'custom',
          message: 'Configure exactamente un valor o ARN para cada secreto',
        });
    if (env.DATA_DRIVER === 'dynamodb' && env.STAGE !== 'local')
      for (const t of TABLE_SPECS)
        if (!env[t.env]) c.addIssue({ code: 'custom', message: `Falta ${t.env}` });
    if (env.STAGE !== 'local' && env.DATA_DRIVER === 'memory')
      c.addIssue({ code: 'custom', message: 'Memory es solo para desarrollo local' });
  });
export function readEnv(input: NodeJS.ProcessEnv = process.env) {
  const env = envSchema.parse(input);
  const defaults = localTableNames();
  return {
    ...env,
    ...Object.fromEntries(TABLE_SPECS.map((t) => [t.env, env[t.env] ?? defaults[t.env]])),
  } as z.infer<typeof envSchema> & typeof defaults;
}
export type Env = ReturnType<typeof readEnv>;
