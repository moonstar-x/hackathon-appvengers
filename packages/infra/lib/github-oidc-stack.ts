import { Stack, CfnOutput, ArnFormat } from 'aws-cdk-lib';
import type { StackProps } from 'aws-cdk-lib';
import type { Construct } from 'constructs';
import {
  OpenIdConnectProvider,
  Role,
  FederatedPrincipal,
  PolicyStatement,
} from 'aws-cdk-lib/aws-iam';
export class GithubOidcStack extends Stack {
  constructor(scope: Construct, id: string, props: StackProps & { repository: string }) {
    super(scope, id, props);
    const provider = new OpenIdConnectProvider(this, 'GithubProvider', {
      url: 'https://token.actions.githubusercontent.com',
      clientIds: ['sts.amazonaws.com'],
    });
    const role = new Role(this, 'GithubDeployRole', {
      assumedBy: new FederatedPrincipal(
        provider.openIdConnectProviderArn,
        {
          StringEquals: { 'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com' },
          StringLike: {
            'token.actions.githubusercontent.com:sub': [
              `repo:${props.repository}:ref:refs/heads/main`,
              `repo:${props.repository}:environment:production`,
            ],
          },
        },
        'sts:AssumeRoleWithWebIdentity',
      ),
    });
    role.addToPolicy(
      new PolicyStatement({
        actions: ['sts:AssumeRole'],
        resources: ['deploy', 'file-publishing', 'lookup'].map((type) =>
          this.formatArn({
            service: 'iam',
            region: '',
            resource: 'role',
            resourceName: `cdk-*-${type}-role-*`,
            arnFormat: ArnFormat.SLASH_RESOURCE_NAME,
          }),
        ),
      }),
    );
    role.addToPolicy(
      new PolicyStatement({
        actions: ['cloudformation:DescribeStacks'],
        resources: [
          this.formatArn({
            service: 'cloudformation',
            resource: 'stack',
            resourceName: 'SmartClub-*/*',
            arnFormat: ArnFormat.SLASH_RESOURCE_NAME,
          }),
          this.formatArn({
            service: 'cloudformation',
            resource: 'stack',
            resourceName: 'EcoClub-*/*',
            arnFormat: ArnFormat.SLASH_RESOURCE_NAME,
          }),
          this.formatArn({
            service: 'cloudformation',
            resource: 'stack',
            resourceName: 'FarmaClub-*/*',
            arnFormat: ArnFormat.SLASH_RESOURCE_NAME,
          }),
        ],
      }),
    );
    role.addToPolicy(
      new PolicyStatement({
        actions: ['dynamodb:PutItem', 'dynamodb:BatchWriteItem'],
        resources: ['SmartClub', 'EcoClub', 'FarmaClub'].map((prefix) =>
          this.formatArn({
            service: 'dynamodb',
            resource: 'table',
            resourceName: prefix + '-*',
            arnFormat: ArnFormat.SLASH_RESOURCE_NAME,
          }),
        ),
      }),
    );
    new CfnOutput(this, 'DeployRoleArn', { value: role.roleArn });
  }
}
