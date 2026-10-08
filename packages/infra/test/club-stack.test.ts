import { describe, it, expect } from 'vitest';
import { App } from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { resolve } from 'node:path';
import { TENANTS, TABLE_SPECS } from '@club/shared';
import { ClubStack } from '../lib/club-stack';
import { GithubOidcStack } from '../lib/github-oidc-stack';
describe('Club AWS infrastructure', () => {
  it.each(['dev', 'prod'] as const)(
    'synthesizes secure isolated %s stacks without credentials',
    (stage) => {
      for (const tenant of Object.values(TENANTS)) {
        const app = new App();
        const stack = new ClubStack(app, tenant.stackPrefix + '-' + stage, {
          tenant,
          stage,
          webAssetPath: resolve(import.meta.dirname, 'fixtures/web'),
        });
        const t = Template.fromStack(stack);
        t.resourceCountIs('AWS::DynamoDB::GlobalTable', 6);
        t.hasResourceProperties('AWS::DynamoDB::GlobalTable', {
          BillingMode: 'PAY_PER_REQUEST',
          Replicas: Match.arrayWith([
            Match.objectLike({
              PointInTimeRecoverySpecification: { PointInTimeRecoveryEnabled: true },
            }),
          ]),
        });
        t.hasResourceProperties('AWS::DynamoDB::GlobalTable', {
          GlobalSecondaryIndexes: Match.arrayWith([Match.objectLike({ IndexName: 'byCustomer' })]),
        });
        t.hasResourceProperties('AWS::DynamoDB::GlobalTable', {
          GlobalSecondaryIndexes: Match.arrayWith([Match.objectLike({ IndexName: 'byCode' })]),
        });
        t.hasResourceProperties('AWS::S3::Bucket', {
          PublicAccessBlockConfiguration: {
            BlockPublicAcls: true,
            BlockPublicPolicy: true,
            IgnorePublicAcls: true,
            RestrictPublicBuckets: true,
          },
          OwnershipControls: { Rules: [{ ObjectOwnership: 'BucketOwnerEnforced' }] },
        });
        t.hasResourceProperties('AWS::S3::BucketPolicy', {
          PolicyDocument: {
            Statement: Match.arrayWith([
              Match.objectLike({
                Effect: 'Deny',
                Condition: { Bool: { 'aws:SecureTransport': 'false' } },
              }),
            ]),
          },
        });
        t.resourceCountIs('AWS::CloudFront::OriginAccessControl', 1);
        t.hasResourceProperties('AWS::CloudFront::Distribution', {
          DistributionConfig: Match.objectLike({
            PriceClass: 'PriceClass_All',
            CustomErrorResponses: Match.absent(),
            DefaultCacheBehavior: Match.objectLike({
              ViewerProtocolPolicy: 'redirect-to-https',
              FunctionAssociations: Match.arrayWith([
                Match.objectLike({ EventType: 'viewer-request' }),
              ]),
            }),
            CacheBehaviors: Match.arrayWith([
              Match.objectLike({
                PathPattern: '/api/*',
                CachePolicyId: '4135ea2d-6df8-44a3-9df3-4b5a84be39ad',
                ViewerProtocolPolicy: 'redirect-to-https',
              }),
            ]),
          }),
        });
        t.hasResourceProperties('AWS::Lambda::Function', {
          Runtime: 'nodejs22.x',
          Architectures: ['arm64'],
          Environment: {
            Variables: Match.objectLike(
              Object.fromEntries(TABLE_SPECS.map((s) => [s.env, Match.anyValue()])),
            ),
          },
        });
        const policies = t.findResources('AWS::IAM::Policy') as Record<
          string,
          {
            Properties: {
              PolicyDocument: {
                Statement: Array<{ Action: string | string[]; Resource: unknown }>;
              };
            };
          }
        >;
        const readIds = Object.keys(t.findResources('AWS::DynamoDB::GlobalTable')).filter(
          (id) => id.includes('Businesses') || id.includes('Streaks'),
        );
        for (const id of readIds) {
          const statements = Object.values(policies)
            .flatMap((p) => p.Properties.PolicyDocument.Statement)
            .filter((statement) => JSON.stringify(statement.Resource).includes(id));
          expect(statements.length).toBeGreaterThan(0);
          const actions = statements.flatMap((statement) =>
            Array.isArray(statement.Action) ? statement.Action : [statement.Action],
          );
          expect(
            actions.every((action) =>
              [
                'dynamodb:BatchGetItem',
                'dynamodb:GetRecords',
                'dynamodb:GetShardIterator',
                'dynamodb:Query',
                'dynamodb:GetItem',
                'dynamodb:Scan',
                'dynamodb:ConditionCheckItem',
                'dynamodb:DescribeTable',
              ].includes(action),
            ),
          ).toBe(true);
        }
        t.hasResourceProperties('AWS::ApiGatewayV2::Stage', {
          DefaultRouteSettings: { ThrottlingRateLimit: 50, ThrottlingBurstLimit: 100 },
        });
        t.resourceCountIs('AWS::SecretsManager::Secret', 2);
        t.hasResourceProperties('AWS::SecretsManager::Secret', {
          GenerateSecretString: Match.anyValue(),
          SecretString: Match.absent(),
        });
        t.resourceCountIs('AWS::Route53::RecordSet', 0);
        if (stage === 'prod')
          t.hasResource('AWS::DynamoDB::GlobalTable', {
            DeletionPolicy: 'Retain',
            Properties: Match.objectLike({
              Replicas: Match.arrayWith([Match.objectLike({ DeletionProtectionEnabled: true })]),
            }),
          });
        const json = JSON.stringify(t.toJSON());
        expect(json).not.toContain('obviously-fake');
        expect(json).not.toContain('AWS::CertificateManager::Certificate');
      }
    },
    30000,
  );
  it('creates the optional GitHub OIDC role', () => {
    const app = new App();
    const t = Template.fromStack(new GithubOidcStack(app, 'Oidc', { repository: 'example/club' }));
    expect(Object.keys(t.findResources('AWS::IAM::Role'))).toHaveLength(2);
    t.hasResourceProperties('AWS::IAM::Role', {
      AssumeRolePolicyDocument: Match.objectLike({
        Statement: Match.arrayWith([Match.objectLike({ Action: 'sts:AssumeRoleWithWebIdentity' })]),
      }),
    });
  });
});
