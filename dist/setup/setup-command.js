import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildProxyConfig, writeProxyEnv } from './proxy-config.js';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
function projectRoot() {
    return path.resolve(__dirname, '..', '..');
}
export async function runSetup(options) {
    const root = projectRoot();
    const config = buildProxyConfig(options, root);
    const envPath = await writeProxyEnv(config);
    return {
        messages: [
            `proxy env: ${envPath}`,
            `proxy: http://${config.host}:${config.port}`,
            `agy bin: ${config.agyBin}`,
            `start: AGY_CLI_BIN=${config.agyBin} AGY_CLI_TIMEOUT_MS=${config.timeoutMs} AGY_CLI_SANDBOX=${config.sandbox} node dist/cli.js agy-proxy --host ${config.host} --port ${config.port}`,
        ],
    };
}
