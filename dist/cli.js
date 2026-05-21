#!/usr/bin/env node
import { Command } from 'commander';
import { runSetup } from './setup/setup-command.js';
import { verifySetup } from './setup/verify.js';
const program = new Command();
program
    .name('agentmemory-ag')
    .description('AgentMemory setup automation for Antigravity, Codex CLI, and Claude Code')
    .version('0.1.0');
program
    .command('setup')
    .description('Configure AgentMemory for one or more clients')
    .option('--client <client>', 'all, antigravity, codex, or claude-code', 'all')
    .option('--profile <profile>', 'local, api-key, or agy-local', 'agy-local')
    .option('--provider <provider>', 'openrouter, openai, anthropic, gemini, or minimax')
    .option('--api-key <key>', 'API key for the selected provider')
    .option('--model <model>', 'model name for the selected provider')
    .option('--base-url <url>', 'base URL for providers that support it')
    .option('--agy-bin <path>', 'path to agy CLI binary')
    .option('--skip-upstream', 'skip cloning/updating the local AgentMemory upstream snapshot', false)
    .action(async (options) => {
    const result = await runSetup({
        client: options.client,
        syncUpstream: !options.skipUpstream,
        profile: options.profile,
        provider: options.provider,
        apiKey: options.apiKey,
        model: options.model,
        baseUrl: options.baseUrl,
        agyBin: options.agyBin,
    });
    for (const line of result.messages)
        console.log(line);
});
program
    .command('agy-proxy')
    .description('Start the local OpenAI-compatible proxy backed by agy CLI')
    .option('--port <port>', 'proxy port', '3129')
    .option('--host <host>', 'proxy host', '127.0.0.1')
    .action(async (options) => {
    const { startAgyProxy } = await import('./agy-proxy/server.js');
    await startAgyProxy({ port: Number.parseInt(options.port, 10), host: options.host });
    console.log(`agy proxy listening on http://${options.host}:${options.port}`);
});
program
    .command('sync-upstream')
    .description('Clone or update local AgentMemory upstream source snapshot')
    .action(async () => {
    const { syncAgentmemorySource } = await import('./setup/source-sync.js');
    const result = await syncAgentmemorySource();
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.ok ? 0 : 1);
});
program
    .command('verify')
    .description('Verify AgentMemory setup')
    .action(async () => {
    const result = await verifySetup();
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.ok ? 0 : 1);
});
program
    .command('status')
    .description('Print AgentMemory setup status without failing')
    .action(async () => {
    const result = await verifySetup();
    console.log(JSON.stringify(result, null, 2));
});
program.parseAsync(process.argv).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
});
