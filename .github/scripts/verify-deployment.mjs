import console from 'node:console';
import { setTimeout as wait } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';
import { readDeploymentOutputs } from './deployment-outputs.mjs';

export async function verifyDeployment({
  webUrl,
  stage,
  fetchImpl = globalThis.fetch,
  attempts = 6,
  retryDelayMs = 5000,
  waitImpl = wait,
  log = console.log,
}) {
  async function check(path) {
    let response;
    try {
      response = await fetchImpl(`${webUrl}${path}`, {
        signal: globalThis.AbortSignal.timeout(10000),
        headers: { 'Cache-Control': 'no-cache' },
      });
    } catch {
      throw new Error(`${path} request failed or timed out`);
    }
    if (response.status !== 200) throw new Error(`${path} returned HTTP ${response.status}`);
    let body;
    try {
      body = await response.json();
    } catch {
      throw new Error(`${path} did not return JSON`);
    }
    if (path === '/api/health') {
      if (body?.status !== 'ok' || body?.app !== 'smartclub')
        throw new Error(`${path} did not return a healthy SmartClub API`);
    } else if (
      body?.program?.id !== 'smartclub' ||
      !Array.isArray(body.businesses) ||
      body.businesses.length === 0 ||
      !Array.isArray(body.streaks) ||
      body.streaks.length === 0
    ) {
      throw new Error(`${path} has an empty or invalid catalog; check the ${stage} seed step`);
    }
  }

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      await Promise.all(['/api/health', '/api/program'].map(check));
      log(`Verified ${stage}: /api/health and /api/program returned 200 with a populated catalog`);
      return;
    } catch (error) {
      if (attempt === attempts)
        throw new Error(
          `Deployment verification failed after ${attempts} attempts: ${error.message}`,
        );
      log(`Deployment check ${attempt}/${attempts} failed: ${error.message}; retrying`);
      await waitImpl(retryDelayMs);
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await verifyDeployment(readDeploymentOutputs());
  } catch (error) {
    console.error(`::error::${error.message}`);
    process.exitCode = 1;
  }
}
