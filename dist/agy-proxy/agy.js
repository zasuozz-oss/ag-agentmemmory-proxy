import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const DEFAULT_TIMEOUT_MS = 120_000;
const MAX_PROMPT_BYTES = 200_000;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..', '..');
const DEFAULT_AGY_BIN = path.join(projectRoot, 'agy-clean-wrapper.sh');
// Root cause of the recurring Google OAuth popup storm: every headless `agy -p`
// spawn must pass agy's hardcoded 5s `keyringAuth` gate (keychain read + token
// validate/refresh). When that intermittently exceeds 5s — even with a still-valid
// token — agy declares "silent auth failed, triggering OAuth" and shells out to the
// system browser launcher (`open` on mac, `xdg-open` on linux; bare names, no
// `/usr/bin/open` literal in the binary → PATH-resolved). The compression hook
// spawns one agy per tool-call, so the dice get rolled constantly and ~5% pop a
// window. agy has no flag to extend the timeout or disable the browser.
//
// Fix: shadow the launcher in the PATH of ONLY the agy children this proxy spawns,
// with a no-op that logs and exits 0. A lost 5s race then fails silently (that one
// observation just isn't compressed; the circuit breaker handles bursts) instead of
// popping a login window. Interactive `agy -i` and the IDE don't inherit this PATH,
// so real logins still open the browser normally.
// ponytail: PATH-shim. macOS/linux solid (bare open/xdg-open). Windows is
// best-effort — agy's win launcher may be a non-PATH syscall (ShellExecute); the
// .cmd shims catch it only if it shells out to rundll32/start. Upgrade path if
// Windows still pops: a single persistent agy session so the 5s gate is passed once,
// not per call. Disable the shim with AGY_NO_BROWSER_SHIM=1.
let cachedShimDir = null;
function browserShimDir() {
    if (process.env.AGY_NO_BROWSER_SHIM === '1')
        return null;
    if (cachedShimDir !== null)
        return cachedShimDir || null;
    cachedShimDir = '';
    try {
        const dir = path.join(os.homedir(), '.ag-agentmemmory-proxy', 'no-browser-shim');
        fs.mkdirSync(dir, { recursive: true });
        const logFile = path.join(os.homedir(), '.ag-agentmemmory-proxy', 'agy-proxy.log');
        if (process.platform === 'win32') {
            const cmd = `@echo off\r\n>>"${logFile}" echo agy oauth browser suppressed (headless): %*\r\nexit /b 0\r\n`;
            for (const name of ['open.cmd', 'xdg-open.cmd', 'rundll32.cmd']) {
                fs.writeFileSync(path.join(dir, name), cmd);
            }
        }
        else {
            const sh = `#!/bin/sh\n# agy OAuth browser suppressed by ag-agentmemory proxy (headless compression must never pop a login window)\nprintf 'agy oauth browser suppressed (headless): %s\\n' "$*" >> "${logFile}" 2>/dev/null\nexit 0\n`;
            for (const name of ['open', 'xdg-open']) {
                const p = path.join(dir, name);
                fs.writeFileSync(p, sh);
                fs.chmodSync(p, 0o755);
            }
        }
        cachedShimDir = dir;
    }
    catch {
        cachedShimDir = ''; // best-effort; if we can't write the shim, fall through (popup may appear, but never crash compression)
    }
    return cachedShimDir || null;
}
function shimmedEnv() {
    const dir = browserShimDir();
    if (!dir)
        return process.env;
    const sep = process.platform === 'win32' ? ';' : ':';
    return { ...process.env, PATH: `${dir}${sep}${process.env.PATH ?? ''}` };
}
const MAX_CONCURRENCY = Number.parseInt(process.env.AGY_PROXY_CONCURRENCY || '3', 10);
// agy's silent consumer-auth fails intermittently (~5% of spawns): every call runs a
// "primary auth fails → silent auth" dance, and when the silent leg also stalls the
// observation is lost (and, without the browser-shim, a login window pops). A fresh
// spawn almost always succeeds, so retry the whole spawn. This is the cheap alternative
// to a persistent agy session (which would need a native PTY + TUI parsing that breaks
// on agy's auto-update). Non-zero exit, timeout, spawn error, AND empty output are all
// retriable — compression never legitimately returns "".
// ponytail: bounded per-attempt timeout caps the worst-case slot-hold at
// MAX_ATTEMPTS × ATTEMPT_TIMEOUT_MS — matters at concurrency=1, where one hung spawn
// blocks the whole queue. Raise ATTEMPT_TIMEOUT_MS if legit slow calls get retried.
const MAX_ATTEMPTS = Math.max(1, Number.parseInt(process.env.AGY_CLI_MAX_ATTEMPTS || '2', 10));
const ATTEMPT_TIMEOUT_MS = Number.parseInt(process.env.AGY_CLI_ATTEMPT_TIMEOUT_MS || '', 10) || 90_000;
let active = 0;
const waiting = [];
async function acquireSlot() {
    if (active < MAX_CONCURRENCY) {
        active++;
        return;
    }
    return new Promise((resolve) => waiting.push(resolve));
}
function releaseSlot() {
    const next = waiting.shift();
    if (next) {
        next();
    }
    else {
        active--;
    }
}
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
// Generic so the retry policy is unit-testable without spawning agy. Returns the first
// non-failure result; on exhaustion returns the last (failed) result if any attempt
// produced one, else throws the last error — preserving the prior contract where an
// empty exit-0 resolved to "".
export async function runWithRetry(run, isFailure, attempts, backoffMs = 0) {
    let lastError;
    let lastResult;
    let haveResult = false;
    for (let i = 1; i <= attempts; i++) {
        try {
            const result = await run();
            if (!isFailure(result))
                return result;
            lastResult = result;
            haveResult = true;
            lastError = new Error('agy returned empty output (likely silent-auth failure)');
        }
        catch (error) {
            lastError = error;
            haveResult = false;
        }
        if (i < attempts && backoffMs)
            await delay(backoffMs);
    }
    if (haveResult)
        return lastResult;
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
export async function runAgyPrompt(prompt, options = {}) {
    await acquireSlot();
    try {
        const fullTimeout = options.timeoutMs || Number.parseInt(process.env.AGY_CLI_TIMEOUT_MS || '', 10) || DEFAULT_TIMEOUT_MS;
        const attemptTimeout = Math.min(fullTimeout, ATTEMPT_TIMEOUT_MS);
        return await runWithRetry(() => runAgyPromptNow(prompt, { ...options, timeoutMs: attemptTimeout }), (out) => out.trim() === '', MAX_ATTEMPTS, 500);
    }
    finally {
        releaseSlot();
    }
}
async function runAgyPromptNow(prompt, options) {
    const agyBin = options.bin || process.env.AGY_CLI_BIN || DEFAULT_AGY_BIN;
    const timeoutMs = options.timeoutMs || Number.parseInt(process.env.AGY_CLI_TIMEOUT_MS || '', 10) || DEFAULT_TIMEOUT_MS;
    const promptBytes = Buffer.byteLength(prompt, 'utf8');
    if (promptBytes > MAX_PROMPT_BYTES) {
        throw new Error(`agy prompt is ${promptBytes} bytes, above ${MAX_PROMPT_BYTES} byte safety limit`);
    }
    const args = ['--print-timeout', `${Math.ceil(timeoutMs / 1000)}s`, '-p'];
    if (options.sandbox ?? process.env.AGY_CLI_SANDBOX === 'true')
        args.push('--sandbox');
    args.push(prompt);
    return new Promise((resolve, reject) => {
        const cwd = process.env.AGY_PROXY_WORKDIR || (process.platform === 'win32' ? os.tmpdir() : '/private/tmp');
        const child = spawn(agyBin, args, {
            stdio: ['ignore', 'pipe', 'pipe'],
            cwd,
            env: shimmedEnv(),
        });
        let stdout = '';
        let stderr = '';
        const timer = setTimeout(() => {
            child.kill('SIGTERM');
            reject(new Error(`agy timed out after ${timeoutMs}ms`));
        }, timeoutMs + 5_000);
        child.stdout.setEncoding('utf8');
        child.stderr.setEncoding('utf8');
        child.stdout.on('data', (chunk) => { stdout += chunk; });
        child.stderr.on('data', (chunk) => { stderr += chunk; });
        child.on('error', (error) => {
            clearTimeout(timer);
            reject(error);
        });
        child.on('close', (code) => {
            clearTimeout(timer);
            if (code === 0)
                resolve(cleanAgyOutput(stdout));
            else
                reject(new Error(`agy exited ${code}: ${stderr.trim()}`));
        });
    });
}
function cleanAgyOutput(output) {
    return output
        .replace(/\u001b\[[0-9;]*[a-zA-Z]/g, '') // all CSI sequences (color, cursor, erase, …)
        .replace(/\u001b\][^\u001b]*(?:\u0007|\u001b\\)/g, '') // OSC sequences
        .replace(/\u001b[^[\]]/g, '') // remaining lone ESC sequences
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '')
        .trim();
}
