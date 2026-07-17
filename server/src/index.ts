import { createProviderFromEnv } from '@triptic/ai-engine';
import { createApp } from './app.js';
import { env } from './env.js';
import { logger } from './logger.js';

const provider = createProviderFromEnv();
const app = createApp({ provider });

app.listen(env.port, () => {
  logger.info({ port: env.port, provider: provider.name }, 'TRIPTIC API started');
});
