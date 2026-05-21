import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
export function hasCommand(command) {
    const lookup = process.platform === 'win32' ? 'where' : 'which';
    const result = spawnSync(lookup, [command], { stdio: 'ignore' });
    return result.status === 0;
}
function run(command, args) {
    const result = spawnSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    const full = `${command} ${args.join(' ')}`;
    const stderr = result.stderr.trim();
    const stdout = result.stdout.trim();
    return {
        ok: result.status === 0,
        command: full,
        message: stderr || stdout || (result.status === 0 ? 'ok' : `exit ${result.status ?? 'unknown'}`),
    };
}
function isAlreadyInstalled(result) {
    return /\balready\b|\binstalled\b|\benabled\b/i.test(result.message);
}
function codexConfigPath() {
    return path.join(process.env.CODEX_HOME || path.join(os.homedir(), '.codex'), 'config.toml');
}
function hasCodexAgentmemoryHooks() {
    const configPath = codexConfigPath();
    const config = fs.existsSync(configPath) ? fs.readFileSync(configPath, 'utf8') : '';
    return config.includes('[plugins."agentmemory@agentmemory"]') &&
        config.includes('enabled = true') &&
        config.includes('agentmemory@agentmemory:hooks/hooks.codex.json');
}
export async function installCodexPlugin() {
    if (!hasCommand('codex')) {
        return { ok: false, attempted: false, results: [], fallbackNeeded: true };
    }
    const add = run('codex', ['plugin', 'marketplace', 'add', 'rohitg00/agentmemory']);
    let install = add.ok
        ? run('codex', ['plugin', 'install', 'agentmemory'])
        : { ok: false, command: 'codex plugin install agentmemory', message: 'skipped because marketplace add failed' };
    const results = [add, install];
    if (!install.ok && add.ok) {
        install = run('codex', ['plugin', 'add', 'agentmemory@agentmemory']);
        results.push(install);
    }
    const ok = results.some((result) => (result.command.startsWith('codex plugin install ') || result.command.startsWith('codex plugin add ')) &&
        (result.ok || isAlreadyInstalled(result)));
    return { ok, attempted: true, results, fallbackNeeded: !ok };
}
export async function connectCodexHooks() {
    if (!hasCommand('agentmemory')) {
        return { ok: false, attempted: false };
    }
    const result = run('agentmemory', ['connect', 'codex', '--with-hooks', '--force']);
    const hooksPath = codexConfigPath();
    return { ok: result.ok && hasCodexAgentmemoryHooks(), attempted: true, result, hooksPath };
}
export async function installClaudeCodePlugin() {
    const manualCommands = [
        '/plugin marketplace add rohitg00/agentmemory',
        '/plugin install agentmemory@agentmemory',
    ];
    if (!hasCommand('claude')) {
        return { ok: false, attempted: false, results: [], manualCommands };
    }
    const add = run('claude', ['plugin', 'marketplace', 'add', 'rohitg00/agentmemory']);
    let install = add.ok
        ? run('claude', ['plugin', 'install', 'agentmemory@agentmemory'])
        : { ok: false, command: 'claude plugin install agentmemory@agentmemory', message: 'skipped because marketplace add failed' };
    const results = [add, install];
    if (!install.ok && add.ok) {
        install = run('claude', ['plugin', 'install', 'agentmemory']);
        results.push(install);
    }
    const ok = results.some((result) => result.command.startsWith('claude plugin install ') &&
        (result.ok || isAlreadyInstalled(result)));
    return { ok, attempted: true, results, manualCommands };
}
export async function connectClaudeCode() {
    const manualCommands = [
        '/plugin marketplace add rohitg00/agentmemory',
        '/plugin install agentmemory@agentmemory',
    ];
    if (!hasCommand('agentmemory')) {
        return { ok: false, attempted: false, manualCommands };
    }
    const result = run('agentmemory', ['connect', 'claude-code']);
    return { ok: result.ok, attempted: true, result, manualCommands };
}
