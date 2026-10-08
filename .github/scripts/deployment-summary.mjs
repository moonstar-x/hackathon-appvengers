import { appendFileSync } from 'node:fs';
import { readDeploymentOutputs } from './deployment-outputs.mjs';
const { stage, webUrl } = readDeploymentOutputs();
appendFileSync(process.env.GITHUB_STEP_SUMMARY, `- [SmartClub 2.0 (${stage})](${webUrl})\n`);
