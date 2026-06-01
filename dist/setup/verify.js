import fs from 'node:fs';
import { buildProxyConfig, defaultProxyConfigPath, readProxyEnv } from './proxy-config.js';
function checkNode() {
    const major = Number.parseInt(process.versions.node.split('.')[0] || '0', 10);
    return {
        name: 'node',
        ok: major >= 20,
        message: `Node.js ${process.versions.node}`,
    };
}
async function checkProxyConfig() {
    const configPath = defaultProxyConfigPath();
    const values = await readProxyEnv(configPath);
    const required = ['AGY_PROXY_HOST', 'AGY_PROXY_PORT', 'AGY_CLI_BIN', 'AGY_CLI_TIMEOUT_MS', 'AGY_CLI_SANDBOX', 'AGY_CLI_DISABLE_AUTO_UPDATE'];
    const missing = required.filter((key) => !values[key]);
    return {
        name: 'proxy config',
        ok: missing.length === 0,
        message: missing.length === 0
            ? `${configPath} has proxy config`
            : `${configPath} missing: ${missing.join(', ')}`,
    };
}
async function checkAgyCli(skipSmoke = false) {
    const values = await readProxyEnv();
    const config = buildProxyConfig({
        host: values.AGY_PROXY_HOST,
        port: values.AGY_PROXY_PORT,
        agyBin: values.AGY_CLI_BIN,
        timeoutMs: values.AGY_CLI_TIMEOUT_MS,
        sandbox: values.AGY_CLI_SANDBOX,
    });
    try {
        const stat = fs.statSync(config.agyBin);
        if (!stat.isFile())
            return { name: 'agy cli', ok: false, message: `${config.agyBin} is not a file` };
        fs.accessSync(config.agyBin, fs.constants.X_OK);
    }
    catch (error) {
        return {
            name: 'agy cli',
            ok: false,
            message: `${config.agyBin} is not executable: ${error instanceof Error ? error.message : String(error)}`,
        };
    }
    if (skipSmoke) {
        return { name: 'agy cli', ok: true, message: `${config.agyBin} exists; smoke skipped` };
    }
    return {
        name: 'agy cli',
        ok: true,
        message: `${config.agyBin} exists`,
    };
}
async function checkProxyHealth(healthUrl) {
    const values = await readProxyEnv();
    const config = buildProxyConfig({
        host: values.AGY_PROXY_HOST,
        port: values.AGY_PROXY_PORT,
        agyBin: values.AGY_CLI_BIN,
        timeoutMs: values.AGY_CLI_TIMEOUT_MS,
        sandbox: values.AGY_CLI_SANDBOX,
    });
    const url = healthUrl || `http://${config.host}:${config.port}/health`;
    try {
        const response = await fetch(url);
        return {
            name: 'agy proxy',
            ok: response.ok,
            message: response.ok ? `${url} responded` : `${url} returned HTTP ${response.status}`,
        };
    }
    catch (error) {
        const cause = error instanceof Error && error.cause instanceof Error ? ` (${error.cause.message})` : '';
        return {
            name: 'agy proxy',
            ok: false,
            message: `${url} unreachable: ${error instanceof Error ? error.message : String(error)}${cause}`,
        };
    }
}
export async function verifySetup(options = {}) {
    const checks = [
        checkNode(),
        await checkProxyConfig(),
        await checkAgyCli(options.skipAgySmoke),
        await checkProxyHealth(options.healthUrl),
    ];
    return {
        ok: checks.every((check) => check.ok),
        checks,
    };
}
