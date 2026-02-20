import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadDotenv } from 'dotenv';
if ((process.env.NODE_ENV ?? 'development') !== 'production') {
    const fileDir = dirname(fileURLToPath(import.meta.url));
    loadDotenv({ path: resolve(fileDir, '../.env') });
}
const [{ getConfig }, { buildServer }] = await Promise.all([
    import('./config.js'),
    import('./server.js'),
]);
async function start() {
    const app = buildServer();
    const config = getConfig();
    try {
        await app.listen({
            host: '0.0.0.0',
            port: config.port,
        });
    }
    catch (error) {
        app.log.error(error);
        process.exit(1);
    }
}
void start();
