import { PROGRAM } from '@club/shared';
import type { Repositories } from './repositories/types';
import { MemoryRepositories } from './repositories/memory';
import { DynamoRepositories, documentClient } from './repositories/dynamo';
import type { Env } from './config/env';
import type { Clock } from './lib/clock';
import { systemClock } from './lib/clock';
import { getSecret } from './lib/secrets';
import { Sessions } from './lib/jwt';
import { createLogger } from './lib/logger';
import { CustomerService } from './services/customer-service';
import { ProgramService } from './services/program-service';
import { ProgressService } from './services/progress-service';
import { RewardService } from './services/reward-service';
import { PurchaseService } from './services/purchase-service';
export async function createContainer(
  env: Env,
  options: { repo?: Repositories; clock?: Clock; logger?: ReturnType<typeof createLogger> } = {},
) {
  const clock = options.clock ?? systemClock;
  const config = PROGRAM;
  const repo =
    options.repo ??
    (env.DATA_DRIVER === 'memory'
      ? new MemoryRepositories()
      : new DynamoRepositories(documentClient(env.DYNAMODB_ENDPOINT), env));
  if (env.DATA_DRIVER === 'memory') await repo.seed(config.businesses, config.streaks);
  const [jwtSecret, posKey] = await Promise.all([
    env.JWT_SECRET ?? getSecret(env.JWT_SECRET_ARN ?? ''),
    env.POS_API_KEY ?? getSecret(env.POS_API_KEY_SECRET_ARN ?? ''),
  ]);
  const program = new ProgramService(repo, clock);
  const customers = new CustomerService(repo, clock);
  const progress = new ProgressService(repo, program, config, clock, env.APP_PUBLIC_HOST);
  const rewards = new RewardService(repo, program, config, clock);
  const purchases = new PurchaseService(repo, customers, program, progress, rewards, clock);
  return {
    env,
    config,
    repo,
    clock,
    program,
    customers,
    progress,
    rewards,
    purchases,
    posKey,
    sessions: new Sessions(jwtSecret),
    logger: options.logger ?? createLogger(env.LOG_LEVEL),
  };
}
export type Container = Awaited<ReturnType<typeof createContainer>>;
