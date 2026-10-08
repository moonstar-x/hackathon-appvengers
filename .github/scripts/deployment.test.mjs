import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseDeploymentOutputs } from './deployment-outputs.mjs';
import { verifyDeployment } from './verify-deployment.mjs';

const webUrl = 'https://example.cloudfront.net';
const health = { status: 'ok', app: 'smartclub' };
const catalog = {
  program: { id: 'smartclub' },
  businesses: [{ businessId: 'farmacias-economicas' }],
  streaks: [{ streakId: 'liga-ahorro' }],
};
const options = { webUrl, stage: 'dev', attempts: 1, log() {} };
const response = (body, status = 200) => ({ status, json: async () => body });

test('selects the requested stage instead of another deployed stack', () => {
  const outputs = {
    'SmartClub-dev': { WebUrl: webUrl },
    'SmartClub-prod': { WebUrl: 'https://production.cloudfront.net' },
  };
  assert.equal(parseDeploymentOutputs(outputs, 'dev').webUrl, webUrl);
  assert.equal(parseDeploymentOutputs(outputs, 'prod').webUrl, outputs['SmartClub-prod'].WebUrl);
  assert.throws(() => parseDeploymentOutputs(outputs, 'local'), /stage/);
  assert.throws(
    () => parseDeploymentOutputs({ 'SmartClub-dev': outputs['SmartClub-dev'] }, 'prod'),
    /Missing SmartClub-prod/,
  );
  assert.throws(
    () => parseDeploymentOutputs({ 'SmartClub-dev': { WebUrl: 'http://example.com' } }, 'dev'),
    /HTTPS/,
  );
});

test('checks both public API paths through CloudFront', async () => {
  const urls = [];
  await verifyDeployment({
    ...options,
    fetchImpl: async (url) => {
      urls.push(url);
      return response(url.endsWith('/health') ? health : catalog);
    },
  });
  assert.deepEqual(urls.sort(), [`${webUrl}/api/health`, `${webUrl}/api/program`]);
});

for (const body of [
  { ...catalog, businesses: [] },
  { ...catalog, streaks: [] },
  { ...catalog, program: { id: 'legacy' } },
]) {
  test(`rejects an unhealthy catalog: ${JSON.stringify(body)}`, async () => {
    await assert.rejects(
      verifyDeployment({
        ...options,
        fetchImpl: async (url) => response(url.endsWith('/health') ? health : body),
      }),
      /empty or invalid catalog/,
    );
  });
}

test('rejects a failing health endpoint without exposing response contents', async () => {
  const logs = [];
  await assert.rejects(
    verifyDeployment({
      ...options,
      attempts: 2,
      waitImpl: async () => {},
      log: (line) => logs.push(line),
      fetchImpl: async () => response({ private: 'never log response bodies' }, 500),
    }),
    /HTTP 500/,
  );
  assert.equal(
    logs.some((line) => line.includes('never log response bodies')),
    false,
  );
});

test('rejects an unhealthy health response even when HTTP succeeds', async () => {
  await assert.rejects(
    verifyDeployment({
      ...options,
      fetchImpl: async (url) => response(url.endsWith('/health') ? { status: 'error' } : catalog),
    }),
    /healthy SmartClub API/,
  );
});

test('identifies non-JSON responses without including their contents', async () => {
  await assert.rejects(
    verifyDeployment({
      ...options,
      fetchImpl: async () => ({
        status: 200,
        json: async () => {
          throw new SyntaxError('private response contents');
        },
      }),
    }),
    /did not return JSON/,
  );
});

test('stops after the retry limit when network requests fail', async () => {
  let retries = 0;
  await assert.rejects(
    verifyDeployment({
      ...options,
      attempts: 3,
      waitImpl: async () => {
        retries++;
      },
      fetchImpl: async () => {
        throw new Error('connection failed');
      },
    }),
    /failed after 3 attempts: \/api\/health request failed or timed out/,
  );
  assert.equal(retries, 2);
});

test('retries transient failures and succeeds when the catalog is ready', async () => {
  let programCalls = 0;
  let retries = 0;
  await verifyDeployment({
    ...options,
    attempts: 2,
    waitImpl: async () => {
      retries++;
    },
    fetchImpl: async (url) => {
      if (url.endsWith('/health')) return response(health);
      programCalls++;
      return response(catalog, programCalls === 1 ? 500 : 200);
    },
  });
  assert.equal(programCalls, 2);
  assert.equal(retries, 1);
});
