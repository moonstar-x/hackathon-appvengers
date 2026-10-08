import { readFileSync, appendFileSync } from 'node:fs';
const outputs = JSON.parse(readFileSync('packages/infra/cdk-outputs.json', 'utf8'));
const lines = Object.entries(outputs)
  .filter(([, value]) => value.WebUrl)
  .map(([stack, value]) => `- [${stack}](${value.WebUrl})`);
appendFileSync(process.env.GITHUB_STEP_SUMMARY, `Club deployments\n\n${lines.join('\n')}\n`);
