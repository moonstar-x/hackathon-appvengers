import { App } from 'aws-cdk-lib';
import { TENANTS } from '@club/shared';
import type { TenantId } from '@club/shared';
import { ClubStack } from '../lib/club-stack';
import { GithubOidcStack } from '../lib/github-oidc-stack';
const app = new App();
const contextStage: unknown = app.node.tryGetContext('stage');
const stage = contextStage ?? 'dev';
if (stage !== 'dev' && stage !== 'prod') throw new Error('stage must be dev or prod');
const contextTenants: unknown = app.node.tryGetContext('tenants');
const selected =
  typeof contextTenants === 'string' ? contextTenants.split(',') : Object.keys(TENANTS);
for (const id of selected) {
  if (!(id in TENANTS)) throw new Error('Unknown tenant ' + id);
  const tenant = TENANTS[id as TenantId];
  new ClubStack(app, tenant.stackPrefix + '-' + stage, {
    tenant,
    stage,
    env: { region: process.env.CDK_DEFAULT_REGION ?? 'us-east-1' },
  });
}
if (app.node.tryGetContext('bootstrapOidc')) {
  const repository: unknown = app.node.tryGetContext('githubRepo');
  if (typeof repository !== 'string' || !/^[-\w.]+\/[-\w.]+$/.test(repository))
    throw new Error('Set -c githubRepo=owner/repo');
  new GithubOidcStack(app, 'Club-GithubOidc', {
    repository,
    env: { region: process.env.CDK_DEFAULT_REGION ?? 'us-east-1' },
  });
}
