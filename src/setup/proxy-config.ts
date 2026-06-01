import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export type ProxyConfigInput = {
  host?: string;
  port?: string | number;
  agyBin?: string;
  timeoutMs?: string | number;
  sandbox?: string | boolean;
};

export type ProxyConfig = {
  host: string;
  port: string;
  agyBin: string;
  timeoutMs: string;
  sandbox: 'true' | 'false';
  disableAutoUpdate: '1';
};

export function defaultProxyConfigPath(home = os.homedir()): string {
  return path.join(home, '.ag-agentmemmory-proxy', 'proxy.env');
}

export function buildProxyConfig(input: ProxyConfigInput = {}, projectRoot = process.cwd()): ProxyConfig {
  const sandbox = input.sandbox === true || input.sandbox === 'true' ? 'true' : 'false';
  return {
    host: input.host || '127.0.0.1',
    port: String(input.port || '3129'),
    agyBin: input.agyBin || path.join(projectRoot, 'agy-clean-wrapper.sh'),
    timeoutMs: String(input.timeoutMs || '120000'),
    sandbox,
    disableAutoUpdate: '1',
  };
}

export function renderProxyEnv(config: ProxyConfig): string {
  return [
    '# Managed by ag-agentmemmory-proxy',
    `AGY_PROXY_HOST=${config.host}`,
    `AGY_PROXY_PORT=${config.port}`,
    `AGY_CLI_BIN=${config.agyBin}`,
    `AGY_CLI_TIMEOUT_MS=${config.timeoutMs}`,
    `AGY_CLI_SANDBOX=${config.sandbox}`,
    `AGY_CLI_DISABLE_AUTO_UPDATE=${config.disableAutoUpdate}`,
    '',
  ].join('\n');
}

export async function writeProxyEnv(config: ProxyConfig, filePath = defaultProxyConfigPath()): Promise<string> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, renderProxyEnv(config), 'utf8');
  return filePath;
}

export async function readProxyEnv(filePath = defaultProxyConfigPath()): Promise<Record<string, string>> {
  const raw = await fs.readFile(filePath, 'utf8').catch(() => '');
  const values: Record<string, string> = {};
  for (const line of raw.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!match) continue;
    values[match[1]!] = match[2]!;
  }
  return values;
}
