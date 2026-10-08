import { readFileSync } from 'node:fs';
import { URL } from 'node:url';

export function parseDeploymentOutputs(outputs, stage) {
  if (!['dev', 'prod'].includes(stage)) throw new Error('Deployment stage must be dev or prod');
  const stackName = `SmartClub-${stage}`;
  const webUrl = outputs?.[stackName]?.WebUrl;
  if (typeof webUrl !== 'string') throw new Error(`Missing ${stackName} WebUrl`);
  const url = new URL(webUrl);
  if (url.protocol !== 'https:' || url.username || url.password)
    throw new Error(`${stackName} WebUrl must be an HTTPS URL without credentials`);
  return { stackName, stage, webUrl: url.origin };
}

export function readDeploymentOutputs({
  stage = process.env.DEPLOY_STAGE ?? 'prod',
  outputsPath = 'packages/infra/cdk-outputs.json',
} = {}) {
  return parseDeploymentOutputs(JSON.parse(readFileSync(outputsPath, 'utf8')), stage);
}
