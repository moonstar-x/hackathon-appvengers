import { config } from 'dotenv';
import { readEnv } from './config/env';
import { createContainer } from './container';
import { createApp } from './app';
import { seedDemo } from './demo';
config({ quiet: true });
const env = readEnv();
const container = await createContainer(env);
if (env.DATA_DRIVER === 'memory') await seedDemo(container);
const server = createApp(container).listen(env.PORT, () => {
  container.logger.info({ port: env.PORT, tenant: env.TENANT_ID }, 'Club API ready');
});
process.on('SIGTERM', () => {
  server.close();
});
