import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { config as loadDotenv } from 'dotenv';

if ((process.env.NODE_ENV ?? 'development') !== 'production') {
  const fileDir = dirname(fileURLToPath(import.meta.url));
  loadDotenv({ path: resolve(fileDir, '../.env') });
}

if (!process.env.ADVISOR_CLOUDFLARE_API_TOKEN && process.env.CLOUDFLARE_API_TOKEN) {
  process.env.ADVISOR_CLOUDFLARE_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
}

if (!process.env.ADVISOR_CLOUDFLARE_ACCOUNT_ID && process.env.CLOUDFLARE_ACCOUNT_ID) {
  process.env.ADVISOR_CLOUDFLARE_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
}

const [{ getConfig }, { buildServer }] = await Promise.all([
  import('./config.js'),
  import('./server.js'),
]);

async function start(): Promise<void> {
  const app = buildServer();
  const config = getConfig();

  const port = Number(process.env.PORT ?? config.port ?? 10000);

  try {
    await app.listen({
      host: '0.0.0.0',
      port,
    });
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
}

void start();
