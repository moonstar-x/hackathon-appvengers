import { readFileSync, appendFileSync } from 'node:fs';
const outputs = JSON.parse(readFileSync('packages/infra/cdk-outputs.json', 'utf8'));
const webUrl = outputs['SmartClub-prod']?.WebUrl;
if (!webUrl) throw new Error('Missing SmartClub-prod WebUrl');
appendFileSync(process.env.GITHUB_STEP_SUMMARY, `- [SmartClub 2.0](${webUrl})\n`);
