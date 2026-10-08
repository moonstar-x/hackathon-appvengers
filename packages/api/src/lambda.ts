import serverlessExpress from '@codegenie/serverless-express';
import { createApp } from './app';
import { createContainer } from './container';
import { readEnv } from './config/env';
const container = await createContainer(readEnv());
export const handler = serverlessExpress({ app: createApp(container) });
