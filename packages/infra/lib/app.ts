import type { App } from 'aws-cdk-lib';
import { PROGRAM } from '@club/shared';
import { ClubStack } from './club-stack';
import { GithubOidcStack } from './github-oidc-stack';

export function createStacks(app: App, webAssetPath?: string) {
  const contextStage: unknown = app.node.tryGetContext('stage');
  const stage = contextStage ?? 'dev';
  if (stage !== 'dev' && stage !== 'prod') throw new Error('stage must be dev or prod');
  const contextTenants: unknown = app.node.tryGetContext('tenants');
  if (contextTenants !== undefined) throw new Error('"-c tenants" was removed in SPEC-001');
  const stack = new ClubStack(app, PROGRAM.stackName + '-' + stage, {
    program: PROGRAM,
    stage,
    webAssetPath,
    env: { region: process.env.CDK_DEFAULT_REGION ?? 'us-east-1' },
  });
  if (app.node.tryGetContext('bootstrapOidc')) {
    const repository: unknown = app.node.tryGetContext('githubRepo');
    if (typeof repository !== 'string' || !/^[-\w.]+\/[-\w.]+$/.test(repository))
      throw new Error('Set -c githubRepo=owner/repo');
    new GithubOidcStack(app, 'Club-GithubOidc', {
      repository,
      env: { region: process.env.CDK_DEFAULT_REGION ?? 'us-east-1' },
    });
  }
  return stack;
}
