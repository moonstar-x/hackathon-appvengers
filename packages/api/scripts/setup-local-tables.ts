import { DynamoDBClient, CreateTableCommand, DescribeTableCommand } from '@aws-sdk/client-dynamodb';
import { TABLE_SPECS, localTableNames } from '@club/shared';
import { parseArgs } from 'node:util';
import { config } from 'dotenv';
config({ quiet: true });
export async function setupTables(tenant: string, endpoint: string) {
  const db = new DynamoDBClient({
    region: 'us-east-1',
    endpoint,
    credentials: { accessKeyId: 'local', secretAccessKey: 'local' },
  });
  const names = localTableNames(tenant);
  for (const spec of TABLE_SPECS) {
    const name = names[spec.env];
    try {
      await db.send(new DescribeTableCommand({ TableName: name }));
      continue;
    } catch (e) {
      if (!(e instanceof Error) || e.name !== 'ResourceNotFoundException') throw e;
    }
    const sort = 'sk' in spec ? spec.sk : undefined;
    const attributes = new Set([
      spec.pk,
      ...(sort ? [sort] : []),
      ...spec.gsis.flatMap((g) => [g.pk, ...('sk' in g ? [g.sk] : [])]),
    ]);
    await db.send(
      new CreateTableCommand({
        TableName: name,
        BillingMode: 'PAY_PER_REQUEST',
        AttributeDefinitions: [...attributes].map((AttributeName) => ({
          AttributeName,
          AttributeType: 'S',
        })),
        KeySchema: [
          { AttributeName: spec.pk, KeyType: 'HASH' },
          ...(sort ? [{ AttributeName: sort, KeyType: 'RANGE' as const }] : []),
        ],
        GlobalSecondaryIndexes: spec.gsis.length
          ? spec.gsis.map((g) => ({
              IndexName: g.name,
              KeySchema: [
                { AttributeName: g.pk, KeyType: 'HASH' },
                ...('sk' in g ? [{ AttributeName: g.sk, KeyType: 'RANGE' as const }] : []),
              ],
              Projection: { ProjectionType: 'ALL' },
            }))
          : undefined,
      }),
    );
  }
}
if (process.argv[1]?.endsWith('setup-local-tables.ts')) {
  const { values } = parseArgs({
    options: { tenant: { type: 'string', default: 'all' } },
    strict: true,
  });
  if (values.tenant !== 'all' && !['ecoclub', 'farmaclub'].includes(values.tenant))
    throw new Error('Unknown tenant');
  for (const tenant of values.tenant === 'all' ? ['ecoclub', 'farmaclub'] : [values.tenant]) {
    await setupTables(tenant, process.env.DYNAMODB_ENDPOINT ?? 'http://localhost:8000');
    console.log(`Tables ready: ${tenant}`);
  }
}
