import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const moduleUrl = pathToFileURL(path.resolve('dist/agy-proxy/agy.js')).href;

test('runAgyPrompt disables agy CLI auto-update for the child process', async (t) => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'agy-env-'));
  t.after(() => fs.rm(tmp, { recursive: true, force: true }));

  const fakeAgy = path.join(tmp, 'fake-agy.mjs');
  await fs.writeFile(
    fakeAgy,
    "#!/usr/bin/env node\nprocess.stdout.write(process.env.AGY_CLI_DISABLE_AUTO_UPDATE || '');\n",
    'utf8',
  );
  await fs.chmod(fakeAgy, 0o755);

  const previous = process.env.AGY_CLI_DISABLE_AUTO_UPDATE;
  delete process.env.AGY_CLI_DISABLE_AUTO_UPDATE;
  try {
    const { runAgyPrompt } = await import(`${moduleUrl}?agy_env_test=${Date.now()}`);
    const output = await runAgyPrompt('hello', { bin: fakeAgy, timeoutMs: 1_000 });
    assert.equal(output, '1');
  } finally {
    if (previous === undefined) delete process.env.AGY_CLI_DISABLE_AUTO_UPDATE;
    else process.env.AGY_CLI_DISABLE_AUTO_UPDATE = previous;
  }
});
