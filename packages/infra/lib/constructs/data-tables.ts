import { Construct } from 'constructs';
import { RemovalPolicy } from 'aws-cdk-lib';
import {
  TableV2,
  AttributeType,
  Billing,
  TableEncryptionV2,
  ProjectionType,
} from 'aws-cdk-lib/aws-dynamodb';
import { TABLE_SPECS } from '@club/shared';
import type { TableEnv } from '@club/shared';
export class DataTables extends Construct {
  readonly tables: Record<TableEnv, TableV2>;
  constructor(scope: Construct, id: string, stage: 'dev' | 'prod') {
    super(scope, id);
    this.tables = Object.fromEntries(
      TABLE_SPECS.map((spec) => {
        const table = new TableV2(this, spec.logicalName, {
          partitionKey: { name: spec.pk, type: AttributeType.STRING },
          ...('sk' in spec ? { sortKey: { name: spec.sk, type: AttributeType.STRING } } : {}),
          billing: Billing.onDemand(),
          encryption: TableEncryptionV2.dynamoOwnedKey(),
          pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
          deletionProtection: stage === 'prod',
          removalPolicy: stage === 'prod' ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
          globalSecondaryIndexes: spec.gsis.map((g) => ({
            indexName: g.name,
            partitionKey: { name: g.pk, type: AttributeType.STRING },
            ...('sk' in g ? { sortKey: { name: g.sk, type: AttributeType.STRING } } : {}),
            projectionType: ProjectionType.ALL,
          })),
        });
        return [spec.env, table];
      }),
    ) as Record<TableEnv, TableV2>;
  }
}
