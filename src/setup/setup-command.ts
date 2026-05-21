import { expandClients } from './clients.js';
import { buildManagedEnvValues, type EnvSetupOptions, upsertAgentmemoryEnv } from './env-file.js';
import { installAntigravityMcp, installClaudeCodeEnv, installCodexMcpFallback, removeClaudeJsonDuplicateMcp } from './mcp-config.js';
import { installAntigravityInstructions } from './instructions.js';
import { installAntigravitySkills } from './skills.js';
import { syncAgentmemorySource } from './source-sync.js';
import {
  connectClaudeCode,
  connectCodexHooks,
  installClaudeCodePlugin,
  installCodexPlugin,
} from './upstream.js';

export async function runSetup(options: { client: string; syncUpstream?: boolean } & EnvSetupOptions): Promise<{ messages: string[] }> {
  const clients = expandClients(options.client);
  const messages: string[] = [];
  const envPlan = buildManagedEnvValues(options);
  const mcpOptions = { embeddingProvider: envPlan.values.EMBEDDING_PROVIDER };

  if (options.syncUpstream !== false) {
    const source = await syncAgentmemorySource();
    messages.push(`upstream source: ${source.action} ${source.workingPath} (${source.message})`);
  }

  const envPath = await upsertAgentmemoryEnv(undefined, options);
  messages.push(`env: ${envPath}`);
  messages.push(`profile: ${options.profile || 'local'} (${envPlan.values.EMBEDDING_PROVIDER} embeddings)`);

  if (clients.includes('antigravity')) {
    messages.push(`antigravity MCP: ${await installAntigravityMcp(undefined, mcpOptions)}`);
    messages.push(`antigravity instructions: ${await installAntigravityInstructions()}`);
    messages.push(`antigravity skills: ${await installAntigravitySkills()}`);
  }

  if (clients.includes('codex')) {
    messages.push(`codex MCP fallback: ${await installCodexMcpFallback(undefined, mcpOptions)}`);
    const plugin = await installCodexPlugin();
    messages.push(plugin.attempted
      ? `codex plugin: ${plugin.ok ? 'installed/enabled' : 'not installed'} (${plugin.results.map((result) => `${result.command}: ${result.message}`).join('; ')})`
      : 'codex plugin: skipped because codex CLI was not found');
    const hooks = await connectCodexHooks();
    messages.push(hooks.attempted
      ? `codex hooks: ${hooks.ok ? 'enabled' : 'not enabled'} (${hooks.result?.message || 'no result'})`
      : 'codex hooks: skipped because agentmemory CLI was not found');
  }

  if (clients.includes('claude-code')) {
    await removeClaudeJsonDuplicateMcp();
    messages.push(`claude-code env: ${await installClaudeCodeEnv(undefined, mcpOptions)}`);
    const plugin = await installClaudeCodePlugin();
    messages.push(plugin.attempted
      ? `claude-code plugin: ${plugin.ok ? 'installed/enabled' : 'not installed'} (${plugin.results.map((result) => `${result.command}: ${result.message}`).join('; ')})`
      : `claude-code plugin: skipped because claude CLI was not found; manual commands: ${plugin.manualCommands.join(' ; ')}`);
    const hooks = await connectClaudeCode();
    messages.push(hooks.attempted
      ? `claude-code hooks: ${hooks.ok ? 'enabled' : 'not enabled'} (${hooks.result?.message || 'no result'})`
      : `claude-code hooks: skipped because agentmemory CLI was not found; manual commands: ${hooks.manualCommands.join(' ; ')}`);
  }

  return { messages };
}
