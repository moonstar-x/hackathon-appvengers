import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  ScanCommand,
  QueryCommand,
  TransactWriteCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import type {
  BusinessDefinition,
  StreakDefinition,
  Customer,
  MonthlyProgress,
  Purchase,
  CustomerReward,
  PurchaseResult,
  TableNames,
} from '@club/shared';
import { AppError } from '../../lib/errors';
import type { Repositories } from '../types';
export function documentClient(endpoint?: string) {
  return DynamoDBDocumentClient.from(
    new DynamoDBClient({
      region: process.env.AWS_REGION ?? 'us-east-1',
      ...(endpoint
        ? { endpoint, credentials: { accessKeyId: 'local', secretAccessKey: 'local' } }
        : {}),
    }),
    { marshallOptions: { removeUndefinedValues: true } },
  );
}
function conditional(error: unknown) {
  return error instanceof Error && error.name === 'ConditionalCheckFailedException';
}
export class DynamoRepositories implements Repositories {
  constructor(
    private readonly db: DynamoDBDocumentClient,
    private readonly tables: TableNames,
  ) {}
  private async get<T>(table: string, key: Record<string, string>): Promise<T | undefined> {
    const r = await this.db.send(
      new GetCommand({ TableName: table, Key: key, ConsistentRead: true }),
    );
    return r.Item as T | undefined;
  }
  private async scan<T>(table: string): Promise<T[]> {
    const items: T[] = [];
    let key: Record<string, unknown> | undefined;
    do {
      const r = await this.db.send(new ScanCommand({ TableName: table, ExclusiveStartKey: key }));
      items.push(...((r.Items ?? []) as T[]));
      key = r.LastEvaluatedKey;
    } while (key);
    return items;
  }
  businesses() {
    return this.scan<BusinessDefinition>(this.tables.TABLE_BUSINESSES);
  }
  streaks() {
    return this.scan<StreakDefinition>(this.tables.TABLE_STREAKS);
  }
  async seed(businesses: BusinessDefinition[], streaks: StreakDefinition[]) {
    const now = new Date().toISOString();
    await Promise.all([
      ...businesses.map((b) =>
        this.db.send(
          new PutCommand({
            TableName: this.tables.TABLE_BUSINESSES,
            Item: { ...b, createdAt: now, updatedAt: now },
          }),
        ),
      ),
      ...streaks.map((s) =>
        this.db.send(new PutCommand({ TableName: this.tables.TABLE_STREAKS, Item: s })),
      ),
    ]);
  }
  customer(ci: string) {
    return this.get<Customer>(this.tables.TABLE_CUSTOMERS, { ci });
  }
  async createCustomer(c: Customer) {
    try {
      await this.db.send(
        new PutCommand({
          TableName: this.tables.TABLE_CUSTOMERS,
          Item: c,
          ConditionExpression: 'attribute_not_exists(ci)',
        }),
      );
      return true;
    } catch (e) {
      if (conditional(e)) return false;
      throw e;
    }
  }
  async history(ci: string, streakId: string) {
    const r = await this.db.send(
      new QueryCommand({
        TableName: this.tables.TABLE_PROGRESS,
        KeyConditionExpression: 'ci = :ci AND begins_with(progressKey, :s)',
        ExpressionAttributeValues: { ':ci': ci, ':s': streakId + '#' },
        ScanIndexForward: false,
        Limit: 36,
        ConsistentRead: true,
      }),
    );
    return (r.Items ?? []).map((item) => ({
      ...item,
      businessesVisited: [...(item.businessesVisited as Set<string>)],
    })) as MonthlyProgress[];
  }
  purchase(id: string) {
    return this.get<Purchase>(this.tables.TABLE_PURCHASES, { purchaseId: id });
  }
  async record(p: Purchase) {
    for (let attempt = 0; attempt < 16; attempt++) {
      try {
        await this.db.send(
          new TransactWriteCommand({
            TransactItems: [
              {
                Put: {
                  TableName: this.tables.TABLE_PURCHASES,
                  Item: p,
                  ConditionExpression: 'attribute_not_exists(purchaseId)',
                },
              },
              ...p.streakIds.map((id) => ({
                Update: {
                  TableName: this.tables.TABLE_PROGRESS,
                  Key: { ci: p.ci, progressKey: id + '#' + p.monthKey },
                  UpdateExpression:
                    'SET streakId=:s, monthKey=:m, lastPurchaseAt=:t, updatedAt=:now, firstPurchaseAt=if_not_exists(firstPurchaseAt,:t) ADD totalCents :amt, purchaseCount :one, businessesVisited :biz',
                  ExpressionAttributeValues: {
                    ':s': id,
                    ':m': p.monthKey,
                    ':t': p.purchasedAt,
                    ':now': p.createdAt,
                    ':amt': p.amountCents,
                    ':one': 1,
                    ':biz': new Set([p.businessId]),
                  },
                },
              })),
            ],
          }),
        );
        return true;
      } catch (e) {
        if (
          !(e instanceof Error) ||
          !['TransactionCanceledException', 'TransactionConflictException'].includes(e.name)
        )
          throw e;
        if (await this.purchase(p.purchaseId)) return false;
        if (attempt === 15) throw e;
        await new Promise((resolve) =>
          setTimeout(resolve, Math.min(250, 10 * 2 ** attempt) + Math.random() * 30),
        );
      }
    }
    throw new Error('Retry exhausted');
  }
  async finalize(id: string, result: PurchaseResult, ids: string[]) {
    try {
      await this.db.send(
        new UpdateCommand({
          TableName: this.tables.TABLE_PURCHASES,
          Key: { purchaseId: id },
          UpdateExpression: 'SET #result=:r, issuedRewardIds=:ids',
          ConditionExpression: 'attribute_not_exists(#result)',
          ExpressionAttributeNames: { '#result': 'result' },
          ExpressionAttributeValues: { ':r': result, ':ids': ids },
        }),
      );
      return result;
    } catch (e) {
      if (!conditional(e)) throw e;
      const p = await this.purchase(id);
      if (!p?.result) throw new Error('Missing replay result');
      return p.result;
    }
  }
  async purchases(ci: string, cursor?: string) {
    let key: Record<string, unknown> | undefined;
    if (cursor) {
      try {
        const parsed: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString());
        if (!parsed || typeof parsed !== 'object' || !('ci' in parsed) || parsed.ci !== ci)
          throw new Error('Invalid cursor');
        key = parsed;
      } catch {
        throw new AppError(400, 'VALIDATION_ERROR', 'Cursor inválido');
      }
    }
    const r = await this.db.send(
      new QueryCommand({
        TableName: this.tables.TABLE_PURCHASES,
        IndexName: 'byCustomer',
        KeyConditionExpression: 'ci=:ci',
        ExpressionAttributeValues: { ':ci': ci },
        ExclusiveStartKey: key,
        ScanIndexForward: false,
        Limit: 20,
      }),
    );
    return {
      items: (r.Items ?? []) as Purchase[],
      cursor: r.LastEvaluatedKey
        ? Buffer.from(JSON.stringify(r.LastEvaluatedKey)).toString('base64url')
        : undefined,
    };
  }
  async rewards(ci: string) {
    const items: CustomerReward[] = [];
    let key: Record<string, unknown> | undefined;
    do {
      const r = await this.db.send(
        new QueryCommand({
          TableName: this.tables.TABLE_REWARDS,
          KeyConditionExpression: 'ci=:ci',
          ExpressionAttributeValues: { ':ci': ci },
          ConsistentRead: true,
          ExclusiveStartKey: key,
        }),
      );
      items.push(...((r.Items ?? []) as CustomerReward[]));
      key = r.LastEvaluatedKey;
    } while (key);
    return items;
  }
  async rewardByCode(code: string) {
    const r = await this.db.send(
      new QueryCommand({
        TableName: this.tables.TABLE_REWARDS,
        IndexName: 'byCode',
        KeyConditionExpression: 'code=:c',
        ExpressionAttributeValues: { ':c': code },
        Limit: 1,
      }),
    );
    const item = r.Items?.[0];
    return item
      ? this.get<CustomerReward>(this.tables.TABLE_REWARDS, {
          ci: item.ci as string,
          rewardInstanceId: item.rewardInstanceId as string,
        })
      : undefined;
  }
  async putReward(r: CustomerReward) {
    try {
      await this.db.send(
        new PutCommand({
          TableName: this.tables.TABLE_REWARDS,
          Item: r,
          ConditionExpression: 'attribute_not_exists(rewardInstanceId)',
        }),
      );
      return true;
    } catch (e) {
      if (conditional(e)) return false;
      throw e;
    }
  }
  async updateReward(r: CustomerReward, expected: CustomerReward['status']) {
    try {
      await this.db.send(
        new PutCommand({
          TableName: this.tables.TABLE_REWARDS,
          Item: r,
          ConditionExpression: '#s=:s',
          ExpressionAttributeNames: { '#s': 'status' },
          ExpressionAttributeValues: { ':s': expected },
        }),
      );
      return true;
    } catch (e) {
      if (conditional(e)) return false;
      throw e;
    }
  }
}
