#!/usr/bin/env node
import { Command } from 'commander';
import { runSetup } from './setup/setup-command.js';
import { verifySetup } from './setup/verify.js';
const program = new Command();
program
    .name('ag-agentmemmory-proxy')
    .description('OpenAI-compatible proxy for agy CLI')
    .version('0.1.0');
program
    .command('setup')
    .description('Configure the agy CLI proxy only')
    .option('--host <host>', 'proxy host', '127.0.0.1')
    .option('--port <port>', 'proxy port', '3129')
    .option('--agy-bin <path>', 'path to agy wrapper or agy CLI binary')
    .option('--timeout-ms <ms>', 'agy CLI timeout in milliseconds', '120000')
    .option('--sandbox', 'run agy CLI with sandbox mode', false)
    .action(async (options) => {
    const result = await runSetup({
        host: options.host,
        port: options.port,
        agyBin: options.agyBin,
        timeoutMs: options.timeoutMs,
        sandbox: options.sandbox,
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
    .command('verify')
    .description('Verify agy proxy setup')
    .action(async () => {
    const result = await verifySetup();
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.ok ? 0 : 1);
});
program
    .command('status')
    .description('Print agy proxy setup status without failing')
    .action(async () => {
    const result = await verifySetup();
    console.log(JSON.stringify(result, null, 2));
    process.exit(0);
});
try {
    await program.parseAsync(process.argv);
}
catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
}
