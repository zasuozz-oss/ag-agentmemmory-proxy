import test from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const verifyUrl = pathToFileURL(path.resolve('dist/setup/verify.js')).href;

test('verifySetup exposes proxy-only check names', async () => {
  const { verifySetup } = await import(verifyUrl);
  const result = await verifySetup({
    skipAgySmoke: true,
    healthUrl: 'http://127.0.0.1:1/health',
  });

  const names = result.checks.map((check) => check.name);
  assert.deepEqual(names, ['node', 'proxy config', 'agy cli', 'agy proxy']);
  assert.equal(names.includes('agentmemory env'), false);
  assert.equal(names.includes('codex setup'), false);
  assert.equal(names.includes('claude-code hooks'), false);
  assert.equal(names.includes('agentmemory health'), false);
  assert.equal(names.includes('agentmemory viewer'), false);
});
