import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { CloudFormationClient, DescribeStacksCommand } from '@aws-sdk/client-cloudformation';
import { ScanCommand, QueryCommand, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { PROGRAM, TABLE_SPECS } from '@club/shared';
import type { Customer, CustomerReward, BenefitDefinition } from '@club/shared';
import { documentClient } from '../src/repositories/dynamo';

export type SourceCustomer = Customer & { tenant: string };
export function mergeCustomers(records: SourceCustomer[]): Customer {
  if (!records.length) throw new Error('No customer records');
  if (new Set(records.map((r) => r.ci)).size !== 1) throw new Error('Customer merge conflict');
  const sorted = [...records].sort(
    (a, b) =>
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime() ||
      a.tenant.localeCompare(b.tenant),
  );
  const first = sorted[0];
  if (!first) throw new Error('No customer records');
  const base = { ...first };
  delete (base as Partial<SourceCustomer>).tenant;
  delete base.email;
  const email = [...sorted].reverse().find((r) => r.email)?.email;
  const lastLoginAt = sorted
    .map((r) => r.lastLoginAt)
    .filter((v): v is string => Boolean(v))
    .sort((a, b) => new Date(a).getTime() - new Date(b).getTime())
    .at(-1);
  return {
    ...base,
    ...(email ? { email } : {}),
    updatedAt:
      sorted
        .map((r) => r.updatedAt)
        .sort((a, b) => new Date(a).getTime() - new Date(b).getTime())
        .at(-1) ?? first.updatedAt,
    ...(lastLoginAt ? { lastLoginAt } : {}),
    legacy: sorted.map((r) => ({ tenant: r.tenant, createdAt: r.createdAt, consent: r.consent })),
  };
}

export function backfillReward(r: CustomerReward): CustomerReward {
  if (r.status === 'REDEEMED') return r;
  const liga = PROGRAM.streaks.find((s) => s.streakId === r.streakId);
  const definition = liga?.tiers.flatMap((t) => t.rewards).find((d) => d.rewardId === r.rewardId);
  const capped = (b: BenefitDefinition) => {
    if (
      !['PERCENT_DISCOUNT', 'SPECIAL_DAYS_DISCOUNT'].includes(b.type) ||
      b.maxDiscountCents !== undefined
    )
      return b;
    const maxDiscountCents = definition?.benefits.find(
      (d) => d.benefitId === b.benefitId,
    )?.maxDiscountCents;
    if (!maxDiscountCents) throw new Error('invalid reward snapshot');
    return { ...b, maxDiscountCents };
  };
  return {
    ...r,
    ...(r.benefit ? { benefit: capped(r.benefit) } : {}),
    ...(r.options ? { options: r.options.map(capped) } : {}),
  };
}

type LogicalName = 'Customers' | 'CustomerStreakProgress' | 'Purchases' | 'CustomerRewards';
type MigrationTables = Record<LogicalName, string>;
type Item = Record<string, unknown>;
export interface MigrationRepository {
  scan: (table: string) => Promise<Item[]>;
  get: (table: string, key: Item) => Promise<Item | undefined>;
  byCode: (table: string, code: string) => Promise<Item | undefined>;
  putIfAbsent: (table: string, pk: string, item: Item) => Promise<boolean>;
}
export class MigrationConflictError extends Error {
  constructor(
    public readonly report: {
      counts: Record<string, number>;
      conflicts: number;
      written: number;
      dryRun: boolean;
    },
  ) {
    super(`Migration conflicts: ${report.conflicts}. No writes performed.`);
  }
}
export async function migrateTenants(
  repo: MigrationRepository,
  sources: Array<{ tenant: string; tables: MigrationTables }>,
  target: MigrationTables,
  apply = false,
) {
  const customers = new Map<string, SourceCustomer[]>();
  const planned: Record<LogicalName, Item[]> = {
    Customers: [],
    CustomerStreakProgress: [],
    Purchases: [],
    CustomerRewards: [],
  };
  const keys: Record<LogicalName, Set<string>> = {
    Customers: new Set(),
    CustomerStreakProgress: new Set(),
    Purchases: new Set(),
    CustomerRewards: new Set(),
  };
  const codes = new Map<string, string>();
  const identity = (name: LogicalName, item: Item): Item => {
    const spec = TABLE_SPECS.find((s) => s.logicalName === name);
    if (!spec) throw new Error('Unknown migration table');
    return { [spec.pk]: item[spec.pk], ...('sk' in spec ? { [spec.sk]: item[spec.sk] } : {}) };
  };
  let conflicts = 0;
  for (const source of sources) {
    for (const name of Object.keys(planned) as LogicalName[]) {
      for (const item of await repo.scan(source.tables[name])) {
        if (name === 'Customers') {
          const record = item as unknown as Customer;
          customers.set(record.ci, [
            ...(customers.get(record.ci) ?? []),
            { ...record, tenant: source.tenant },
          ]);
          continue;
        }
        const key = JSON.stringify(identity(name, item));
        if (keys[name].has(key)) conflicts++;
        keys[name].add(key);
        const migrated =
          name === 'CustomerRewards'
            ? (backfillReward(item as unknown as CustomerReward) as unknown as Item)
            : item;
        if (name === 'CustomerRewards') {
          const code = String(item.code);
          const duplicate = codes.get(code);
          if (duplicate && duplicate !== key) conflicts++;
          codes.set(code, key);
          const existing = await repo.byCode(target.CustomerRewards, code);
          if (existing && JSON.stringify(identity(name, existing)) !== key) conflicts++;
        }
        const existing = await repo.get(target[name], identity(name, migrated));
        // Re-runs may encounter records already copied. Only conflicting identities abort.
        if (
          existing &&
          name === 'Purchases' &&
          (existing.ci !== item.ci ||
            existing.businessId !== item.businessId ||
            existing.amountCents !== item.amountCents)
        )
          conflicts++;
        if (existing && name === 'CustomerRewards' && existing.code !== item.code) conflicts++;
        planned[name].push(migrated);
      }
    }
  }
  planned.Customers = [...customers.values()].map(
    (records) => mergeCustomers(records) as unknown as Item,
  );
  const counts = Object.fromEntries(
    Object.entries(planned).map(([name, items]) => [name, items.length]),
  );
  if (conflicts)
    throw new MigrationConflictError({ counts, conflicts, written: 0, dryRun: !apply });
  let written = 0;
  if (apply)
    for (const name of Object.keys(planned) as LogicalName[]) {
      const spec = TABLE_SPECS.find((s) => s.logicalName === name);
      if (!spec) throw new Error('Unknown migration table');
      for (const item of planned[name])
        if (await repo.putIfAbsent(target[name], spec.pk, item)) written++;
    }
  return { counts, conflicts, written, dryRun: !apply };
}

export function dynamoMigrationRepository(): MigrationRepository {
  const db = documentClient();
  return {
    async scan(table) {
      const items: Item[] = [];
      let cursor: Item | undefined;
      do {
        const page = await db.send(
          new ScanCommand({ TableName: table, ExclusiveStartKey: cursor }),
        );
        items.push(...(page.Items ?? []));
        cursor = page.LastEvaluatedKey;
      } while (cursor);
      return items;
    },
    async get(table, key) {
      return (await db.send(new GetCommand({ TableName: table, Key: key, ConsistentRead: true })))
        .Item;
    },
    async byCode(table, code) {
      return (
        await db.send(
          new QueryCommand({
            TableName: table,
            IndexName: 'byCode',
            KeyConditionExpression: '#code = :code',
            ExpressionAttributeNames: { '#code': 'code' },
            ExpressionAttributeValues: { ':code': code },
          }),
        )
      ).Items?.[0];
    },
    async putIfAbsent(table, pk, item) {
      try {
        await db.send(
          new PutCommand({
            TableName: table,
            Item: item,
            ConditionExpression: 'attribute_not_exists(#pk)',
            ExpressionAttributeNames: { '#pk': pk },
          }),
        );
        return true;
      } catch (e) {
        if (e instanceof Error && e.name === 'ConditionalCheckFailedException') return false;
        throw e;
      }
    },
  };
}
async function main() {
  const { values } = parseArgs({
    options: {
      stage: { type: 'string', default: 'dev' },
      apply: { type: 'boolean', default: false },
    },
    strict: true,
  });
  if (!['dev', 'prod'].includes(values.stage)) throw new Error('Stage must be dev or prod');
  const cloud = new CloudFormationClient({ region: process.env.AWS_REGION ?? 'us-east-1' });
  const resolve = async (stack: string): Promise<MigrationTables> => {
    const result = await cloud.send(
      new DescribeStacksCommand({ StackName: `${stack}-${values.stage}` }),
    );
    const outputs: Record<string, string | undefined> = {};
    for (const output of result.Stacks?.[0]?.Outputs ?? []) {
      if (output.OutputKey) outputs[output.OutputKey] = output.OutputValue;
    }
    return Object.fromEntries(
      ['Customers', 'CustomerStreakProgress', 'Purchases', 'CustomerRewards'].map((name) => {
        const table = outputs[name + 'TableName'];
        if (!table) throw new Error('Missing migration stack output');
        return [name, table];
      }),
    ) as MigrationTables;
  };
  const sources = await Promise.all(
    [
      { tenant: 'ecoclub', stack: 'EcoClub' },
      { tenant: 'farmaclub', stack: 'FarmaClub' },
    ].map(async (s) => ({ tenant: s.tenant, tables: await resolve(s.stack) })),
  );
  console.log(
    JSON.stringify(
      await migrateTenants(
        dynamoMigrationRepository(),
        sources,
        await resolve('SmartClub'),
        values.apply,
      ),
    ),
  );
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main().catch((error: unknown) => {
    if (error instanceof MigrationConflictError) console.error(JSON.stringify(error.report));
    else
      console.error(
        'Migration failed. Resolve table conflicts or invalid snapshots before retrying. No customer data is logged.',
      );
    process.exitCode = 1;
  });
}
