import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const MCP_ENV = {
  AGENTMEMORY_URL: 'http://localhost:3111',
  EMBEDDING_PROVIDER: 'local',
};

export type McpEnvOptions = {
  embeddingProvider?: string;
};

function renderMcpEnv(options: McpEnvOptions = {}): Record<string, string> {
  return {
    ...MCP_ENV,
    EMBEDDING_PROVIDER: options.embeddingProvider || MCP_ENV.EMBEDDING_PROVIDER,
  };
}

function agentmemoryMcpEntry(options: McpEnvOptions = {}): { command: string; args: string[]; env: Record<string, string> } {
  return {
    command: 'npx',
    args: ['-y', '@agentmemory/mcp'],
    env: renderMcpEnv(options),
  };
}

async function readJson(filePath: string): Promise<unknown> {
  return fs.readFile(filePath, 'utf8').then(JSON.parse).catch(() => ({}));
}

async function writeJson(filePath: string, data: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

export function antigravityMcpPath(home = os.homedir()): string {
  return path.join(home, '.gemini', 'antigravity', 'mcp_config.json');
}

export async function installAntigravityMcp(filePath = antigravityMcpPath(), options: McpEnvOptions = {}): Promise<string> {
  const existing = await readJson(filePath);
  const config = existing && typeof existing === 'object' ? { ...(existing as Record<string, unknown>) } : {};
  const servers =
    config.mcpServers && typeof config.mcpServers === 'object'
      ? { ...(config.mcpServers as Record<string, unknown>) }
      : {};
  servers.agentmemory = agentmemoryMcpEntry(options);
  config.mcpServers = servers;
  await writeJson(filePath, config);
  return filePath;
}

export function codexConfigPath(home = os.homedir()): string {
  return path.join(process.env.CODEX_HOME || path.join(home, '.codex'), 'config.toml');
}

export function renderCodexMcpBlock(options: McpEnvOptions = {}): string {
  const env = renderMcpEnv(options);
  return `[mcp_servers.agentmemory]
command = "npx"
args = ["-y", "@agentmemory/mcp"]

[mcp_servers.agentmemory.env]
AGENTMEMORY_URL = "${env.AGENTMEMORY_URL}"
EMBEDDING_PROVIDER = "${env.EMBEDDING_PROVIDER}"
`;
}

export async function installCodexMcpFallback(filePath = codexConfigPath(), options: McpEnvOptions = {}): Promise<string> {
  const current = await fs.readFile(filePath, 'utf8').catch(() => '');
  const withoutOld = current
    .replace(/\n?\[mcp_servers\.agentmemory\][\s\S]*?(?=\n\[|$)/g, '')
    .replace(/\n?\[mcp_servers\.agentmemory\.env\][\s\S]*?(?=\n\[|$)/g, '')
    .trim();
  const next = `${withoutOld ? `${withoutOld}\n\n` : ''}${renderCodexMcpBlock(options)}`;
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, next, 'utf8');
  return filePath;
}

export function claudeCodeSettingsPath(home = os.homedir()): string {
  return path.join(home, '.claude', 'settings.json');
}

export async function removeClaudeJsonDuplicateMcp(home = os.homedir()): Promise<void> {
  const claudeJsonPath = path.join(home, '.claude.json');
  const raw = await fs.readFile(claudeJsonPath, 'utf8').catch(() => null);
  if (!raw) return;
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return;
  }
  const servers = data.mcpServers;
  if (!servers || typeof servers !== 'object' || !('agentmemory' in (servers as Record<string, unknown>))) return;
  delete (servers as Record<string, unknown>).agentmemory;
  await fs.writeFile(claudeJsonPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

export async function installClaudeCodeEnv(filePath = claudeCodeSettingsPath(), options: McpEnvOptions = {}): Promise<string> {
  const raw = await fs.readFile(filePath, 'utf8').catch(() => '{}');
  let settings: Record<string, unknown>;
  try {
    settings = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    settings = {};
  }

  const env = settings.env && typeof settings.env === 'object' && !Array.isArray(settings.env)
    ? { ...(settings.env as Record<string, string>) }
    : {};

  const agentmemoryUrl = options.embeddingProvider
    ? MCP_ENV.AGENTMEMORY_URL
    : MCP_ENV.AGENTMEMORY_URL;

  env.AGENTMEMORY_URL = agentmemoryUrl;
  env.AGENTMEMORY_INJECT_CONTEXT = 'true';
  if (!('AGENTMEMORY_SECRET' in env)) env.AGENTMEMORY_SECRET = '';

  settings.env = env;

  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(settings, null, 2)}\n`, 'utf8');
  return filePath;
}
