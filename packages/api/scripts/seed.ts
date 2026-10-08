import { parseArgs } from 'node:util';
import { config } from 'dotenv';
import { CloudFormationClient, DescribeStacksCommand } from '@aws-sdk/client-cloudformation';
import { PROGRAM, programConfigSchema, localTableNames, TABLE_SPECS } from '@club/shared';
import type { TableNames } from '@club/shared';
import { readEnv } from '../src/config/env';
import { createContainer } from '../src/container';
import { DynamoRepositories, documentClient } from '../src/repositories/dynamo';
import { seedDemo } from '../src/demo';
config({ quiet: true });
const { values } = parseArgs({
  options: {
    stage: { type: 'string', default: 'dev' },
    local: { type: 'boolean', default: false },
    demo: { type: 'boolean', default: false },
  },
});
if (values.demo && values.stage === 'prod') throw new Error('Demo data is prohibited in prod');
if (!['dev', 'prod'].includes(values.stage)) throw new Error('Stage must be dev or prod');
const program = programConfigSchema.parse(PROGRAM);
if (values.local) {
  const c = await createContainer(
    readEnv({
      ...process.env,
      DATA_DRIVER: 'dynamodb',
      STAGE: 'local',
      ...localTableNames(),
    }),
  );
  await c.repo.seed(program.businesses, program.streaks);
  if (values.demo) await seedDemo(c);
  console.log(`Seeded ${program.id}${values.demo ? ' with synthetic demo data' : ''}`);
  console.log(`Local development POS key: ${c.posKey}`);
} else {
  const r = await new CloudFormationClient({ region: process.env.AWS_REGION ?? 'us-east-1' }).send(
    new DescribeStacksCommand({ StackName: program.stackName + '-' + values.stage }),
  );
  const outputs: Record<string, string> = {};
  for (const output of r.Stacks?.[0]?.Outputs ?? []) {
    if (output.OutputKey && output.OutputValue) outputs[output.OutputKey] = output.OutputValue;
  }
  const tables = Object.fromEntries(
    TABLE_SPECS.map((t) => {
      const name = outputs[t.logicalName + 'TableName'];
      if (!name) throw new Error('Missing stack output ' + t.logicalName);
      return [t.env, name];
    }),
  ) as TableNames;
  const repo = new DynamoRepositories(documentClient(), tables);
  await repo.seed(program.businesses, program.streaks);
  if (values.demo) {
    const c = await createContainer(
      readEnv({
        ...process.env,
        DATA_DRIVER: 'dynamodb',
        STAGE: values.stage,
        JWT_SECRET: undefined,
        POS_API_KEY: undefined,
        JWT_SECRET_ARN: outputs.JwtSecretArn,
        POS_API_KEY_SECRET_ARN: outputs.PosApiKeySecretArn,
        APP_PUBLIC_HOST: outputs.WebUrl?.replace('https://', ''),
        ...tables,
      }),
      { repo },
    );
    await seedDemo(c);
  }
  console.log(`Seeded ${program.id}`);
  console.log(`POS key location: ${outputs.PosApiKeySecretArn ?? 'missing'}`);
}
