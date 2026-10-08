import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import type {
  BusinessDefinition,
  StreakDefinition,
  Customer,
  Purchase,
  CustomerReward,
  PurchaseResult,
} from '@club/shared';
import type { Repositories } from '../types';
import { MemoryRepositories } from '../memory';
import type { MemorySnapshot } from '../memory';
import { snapshotSchema } from './schema';

export class JsonRepositories implements Repositories {
  // All instances using the same file share a queue within this process.
  private static readonly queues = new Map<string, Promise<void>>();
  private readonly filePath: string;

  constructor(filePath: string) {
    this.filePath = resolve(filePath);
  }

  private async load(): Promise<MemorySnapshot | undefined> {
    let contents: string;
    try {
      contents = await readFile(this.filePath, 'utf8');
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return undefined;
      throw error;
    }
    try {
      return snapshotSchema.parse(JSON.parse(contents) as unknown);
    } catch (error) {
      throw new Error(`Invalid JSON storage file: ${this.filePath}`, { cause: error });
    }
  }

  private async save(snapshot: MemorySnapshot) {
    await mkdir(dirname(this.filePath), { recursive: true });
    const temporaryPath = `${this.filePath}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporaryPath, JSON.stringify({ version: 1, ...snapshot }, null, 2) + '\n', {
        flag: 'wx',
        mode: 0o600,
        flush: true,
      });
      await rename(temporaryPath, this.filePath);
    } catch (error) {
      await rm(temporaryPath, { force: true }).catch(() => undefined);
      throw error;
    }
  }

  private run<T>(operation: (repo: MemoryRepositories) => Promise<T>, write = false): Promise<T> {
    const previous = JsonRepositories.queues.get(this.filePath) ?? Promise.resolve();
    const pending = previous.then(async () => {
      const repo = new MemoryRepositories(await this.load());
      const result = await operation(repo);
      if (write && result !== false) await this.save(repo.snapshot());
      return result;
    });
    const settled = pending.then(
      () => undefined,
      () => undefined,
    );
    JsonRepositories.queues.set(this.filePath, settled);
    void settled.then(() => {
      if (JsonRepositories.queues.get(this.filePath) === settled)
        JsonRepositories.queues.delete(this.filePath);
    });
    return pending;
  }

  businesses() {
    return this.run((repo) => repo.businesses());
  }
  streaks() {
    return this.run((repo) => repo.streaks());
  }
  seed(businesses: BusinessDefinition[], streaks: StreakDefinition[]) {
    return this.run((repo) => repo.seed(businesses, streaks), true);
  }
  customer(ci: string) {
    return this.run((repo) => repo.customer(ci));
  }
  createCustomer(customer: Customer) {
    return this.run((repo) => repo.createCustomer(customer), true);
  }
  history(ci: string, streakId: string) {
    return this.run((repo) => repo.history(ci, streakId));
  }
  purchase(id: string) {
    return this.run((repo) => repo.purchase(id));
  }
  record(purchase: Purchase) {
    return this.run((repo) => repo.record(purchase), true);
  }
  finalize(id: string, result: PurchaseResult, ids: string[]) {
    return this.run((repo) => repo.finalize(id, result, ids), true);
  }
  purchases(ci: string, cursor?: string) {
    return this.run((repo) => repo.purchases(ci, cursor));
  }
  rewards(ci: string) {
    return this.run((repo) => repo.rewards(ci));
  }
  rewardByCode(code: string) {
    return this.run((repo) => repo.rewardByCode(code));
  }
  putReward(reward: CustomerReward) {
    return this.run((repo) => repo.putReward(reward), true);
  }
  updateReward(reward: CustomerReward, expected: CustomerReward['status']) {
    return this.run((repo) => repo.updateReward(reward, expected), true);
  }
}
