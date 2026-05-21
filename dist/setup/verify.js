import fsPromises from 'node:fs/promises';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { AGENTMEMORY_ENV_VALUES, agentmemoryEnvPath, detectActiveApiProvider, readEnvValues } from './env-file.js';
import { antigravityMcpPath, claudeCodeSettingsPath, codexConfigPath } from './mcp-config.js';
import { antigravitySkillsPath } from './skills.js';
import { hasCommand } from './upstream.js';
import path from 'node:path';
import os from 'node:os';
function checkNode() {
    const major = Number.parseInt(process.versions.node.split('.')[0] || '0', 10);
    return {
        name: 'node',
        ok: major >= 20,
        message: `Node.js ${process.versions.node}`,
    };
}
function commandCheck(command) {
    return {
        name: command,
        ok: hasCommand(command),
        message: hasCommand(command) ? `${command} found` : `${command} not found`,
    };
}
async function checkEnv() {
    const values = await readEnvValues();
    const apiProvider = detectActiveApiProvider(values);
    const apiMode = values.AGENTMEMORY_AUTO_COMPRESS === 'true' && values.CONSOLIDATION_ENABLED === 'true';
    const graphEnabled = values.GRAPH_EXTRACTION_ENABLED === 'true';
    const expected = apiMode && apiProvider
        ? {
            ...AGENTMEMORY_ENV_VALUES,
            AGENTMEMORY_AUTO_COMPRESS: 'true',
            CONSOLIDATION_ENABLED: 'true',
            GRAPH_EXTRACTION_ENABLED: graphEnabled ? 'true' : AGENTMEMORY_ENV_VALUES.GRAPH_EXTRACTION_ENABLED,
        }
        : AGENTMEMORY_ENV_VALUES;
    const missing = Object.entries(expected)
        .filter(([key, value]) => values[key] !== value)
        .map(([key]) => key);
    const missingApiKey = apiMode && !apiProvider;
    return {
        name: 'agentmemory env',
        ok: missing.length === 0 && !missingApiKey,
        message: missing.length === 0 && !missingApiKey
            ? apiMode
                ? `${agentmemoryEnvPath()} has ${apiProvider} API-key LLM config`
                : `${agentmemoryEnvPath()} has local embedding config with LLM automation disabled`
            : missingApiKey
                ? `${agentmemoryEnvPath()} enables LLM automation but has no active provider API key`
                : `${agentmemoryEnvPath()} missing or mismatched: ${missing.join(', ')}`,
    };
}
async function isAgyMode() {
    const values = await readEnvValues();
    return {
        ok: values.OPENAI_BASE_URL === 'http://127.0.0.1:3129' && values.OPENAI_MODEL === 'agy-cli',
        values,
    };
}
async function checkAntigravity() {
    try {
        const raw = await fsPromises.readFile(antigravityMcpPath(), 'utf8');
        const parsed = JSON.parse(raw);
        const ok = Boolean(parsed.mcpServers?.agentmemory);
        return {
            name: 'antigravity mcp',
            ok,
            message: ok ? `${antigravityMcpPath()} has agentmemory` : `${antigravityMcpPath()} missing agentmemory`,
        };
    }
    catch (error) {
        return {
            name: 'antigravity mcp',
            ok: false,
            message: `${antigravityMcpPath()} unreadable: ${error instanceof Error ? error.message : String(error)}`,
        };
    }
}
async function checkAntigravitySkills() {
    const required = [
        'agentmemory-recall',
        'agentmemory-observe',
        'agentmemory-session-start',
        'agentmemory-session-end',
        'agentmemory-setup',
    ];
    const missing = [];
    for (const skill of required) {
        try {
            await fsPromises.access(`${antigravitySkillsPath()}/${skill}/SKILL.md`);
        }
        catch {
            missing.push(skill);
        }
    }
    return {
        name: 'antigravity skills',
        ok: missing.length === 0,
        message: missing.length === 0
            ? `${antigravitySkillsPath()} has required skills`
            : `missing skills: ${missing.join(', ')}`,
    };
}
async function checkCodex() {
    const config = await fsPromises.readFile(codexConfigPath(), 'utf8').catch(() => '');
    const hasMcp = config.includes('[mcp_servers.agentmemory]');
    const hasHooks = config.includes('[plugins."agentmemory@agentmemory"]') &&
        config.includes('enabled = true') &&
        config.includes('agentmemory@agentmemory:hooks/hooks.codex.json');
    return {
        name: 'codex setup',
        ok: hasMcp && hasHooks,
        message: hasMcp && hasHooks
            ? `${codexConfigPath()} has MCP fallback and AgentMemory plugin hooks`
            : `missing ${[
                hasMcp ? '' : 'MCP fallback',
                hasHooks ? '' : 'AgentMemory hooks',
            ].filter(Boolean).join(', ')}`,
    };
}
async function checkClaudeCodeHooks() {
    if (!hasCommand('claude')) {
        return {
            name: 'claude-code hooks',
            ok: true,
            message: 'claude CLI not found; Claude Code hook setup is skipped on this machine',
        };
    }
    let settings = {};
    try {
        const raw = await fsPromises.readFile(claudeCodeSettingsPath(), 'utf8');
        settings = JSON.parse(raw);
    }
    catch {
        // settings file missing or invalid — treat as not configured
    }
    const enabledPlugins = settings.enabledPlugins && typeof settings.enabledPlugins === 'object'
        ? settings.enabledPlugins
        : {};
    const pluginEnabled = Boolean(enabledPlugins['agentmemory@agentmemory']);
    const env = settings.env && typeof settings.env === 'object' && !Array.isArray(settings.env)
        ? settings.env
        : {};
    const hasAgentmemoryUrl = Boolean(env.AGENTMEMORY_URL);
    const issues = [];
    if (!pluginEnabled)
        issues.push('agentmemory@agentmemory plugin not enabled in settings.json');
    if (!hasAgentmemoryUrl)
        issues.push('AGENTMEMORY_URL not set in settings.json env (MCP template vars will be unresolved)');
    return {
        name: 'claude-code hooks',
        ok: issues.length === 0,
        message: issues.length === 0
            ? `${claudeCodeSettingsPath()} has plugin enabled and AGENTMEMORY_URL configured`
            : issues.join('; '),
    };
}
async function checkSourceSnapshot() {
    const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
    const working = path.join(root, 'agentmemory');
    const hasPackage = await fsPromises.access(path.join(working, 'package.json')).then(() => true).catch(() => false);
    const hasGit = await fsPromises.access(path.join(working, '.git')).then(() => true).catch(() => false);
    return {
        name: 'upstream source snapshot',
        ok: hasPackage && !hasGit,
        message: hasPackage && !hasGit
            ? `${working} exists without .git`
            : `${working} missing package.json or still has .git`,
    };
}
function checkAgyProxy() {
    const result = spawnSync('curl', ['-fsSL', 'http://127.0.0.1:3129/health'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    return {
        name: 'agy proxy',
        ok: result.status === 0,
        message: result.status === 0
            ? 'http://127.0.0.1:3129/health responded'
            : 'agy proxy not running; start with: node dist/cli.js agy-proxy --host 127.0.0.1 --port 3129',
    };
}
function checkAgyCli(values) {
    const agyBin = values.AGY_CLI_BIN || path.join(os.homedir(), '.local', 'bin', 'agy');
    try {
        const stat = fs.statSync(agyBin);
        if (!stat.isFile()) {
            return { name: 'agy cli', ok: false, message: `${agyBin} is not a file` };
        }
        fs.accessSync(agyBin, fs.constants.X_OK);
    }
    catch (error) {
        return {
            name: 'agy cli',
            ok: false,
            message: `${agyBin} is not executable: ${error instanceof Error ? error.message : String(error)}`,
        };
    }
    const timeoutMs = Number.parseInt(values.AGY_CLI_TIMEOUT_MS || '120000', 10);
    const timeoutSeconds = Math.max(30, Math.ceil((Number.isFinite(timeoutMs) ? timeoutMs : 120000) / 1000));
    const result = spawnSync(agyBin, ['--print-timeout', `${timeoutSeconds}s`, '-p', 'Return exactly: OK'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: (timeoutSeconds + 5) * 1000,
    });
    const ok = result.status === 0 && result.stdout.includes('OK');
    return {
        name: 'agy cli',
        ok,
        message: ok
            ? `${agyBin} returned OK`
            : `${agyBin} smoke test failed: ${(result.stderr || result.stdout || `exit ${result.status ?? 'unknown'}`).trim()}`,
    };
}
function checkHealth() {
    const result = spawnSync('curl', ['-fsSL', 'http://localhost:3111/agentmemory/health'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    return {
        name: 'agentmemory health',
        ok: result.status === 0,
        message: result.status === 0
            ? 'http://localhost:3111/agentmemory/health responded'
            : 'server not running; start with: npx -y @agentmemory/agentmemory@latest',
    };
}
function checkViewer() {
    const result = spawnSync('curl', ['-fsSL', '-o', '/dev/null', 'http://localhost:3113/'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    return {
        name: 'agentmemory viewer',
        ok: result.status === 0,
        message: result.status === 0
            ? 'http://localhost:3113/ responded to GET'
            : 'viewer not reachable with GET at http://localhost:3113/',
    };
}
export async function verifySetup() {
    const agyMode = await isAgyMode();
    const checks = [
        checkNode(),
        commandCheck('npx'),
        await checkEnv(),
        await checkAntigravity(),
        await checkAntigravitySkills(),
        await checkCodex(),
        await checkSourceSnapshot(),
        await checkClaudeCodeHooks(),
        ...(agyMode.ok ? [checkAgyProxy(), checkAgyCli(agyMode.values)] : []),
        checkHealth(),
        checkViewer(),
    ];
    return {
        ok: checks.every((check) => check.ok || check.name === 'agentmemory health' || check.name === 'agentmemory viewer'),
        checks,
    };
}
