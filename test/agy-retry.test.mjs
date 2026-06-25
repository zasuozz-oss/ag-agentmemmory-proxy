import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const moduleUrl = pathToFileURL(path.resolve('dist/agy-proxy/agy.js')).href;

const isEmpty = (s) => s.trim() === '';

test('returns first success without retrying', async () => {
  const { runWithRetry } = await import(moduleUrl);
  let calls = 0;
  const out = await runWithRetry(async () => { calls++; return 'OK'; }, isEmpty, 3);
  assert.equal(out, 'OK');
  assert.equal(calls, 1);
});

test('retries on empty output then succeeds', async () => {
  const { runWithRetry } = await import(moduleUrl);
  let calls = 0;
  const out = await runWithRetry(async () => { calls++; return calls < 2 ? '' : 'OK'; }, isEmpty, 3);
  assert.equal(out, 'OK');
  assert.equal(calls, 2);
});

test('retries on thrown error then succeeds', async () => {
  const { runWithRetry } = await import(moduleUrl);
  let calls = 0;
  const out = await runWithRetry(async () => {
    calls++;
    if (calls < 3) throw new Error(`agy exited 1 (attempt ${calls})`);
    return 'OK';
  }, isEmpty, 3);
  assert.equal(out, 'OK');
  assert.equal(calls, 3);
});

test('exhausts attempts of throws and rethrows the last error', async () => {
  const { runWithRetry } = await import(moduleUrl);
  let calls = 0;
  await assert.rejects(
    runWithRetry(async () => { calls++; throw new Error(`fail ${calls}`); }, isEmpty, 2),
    /fail 2/,
  );
  assert.equal(calls, 2);
});

test('exhausts attempts of empty output and returns "" (preserves prior contract)', async () => {
  const { runWithRetry } = await import(moduleUrl);
  let calls = 0;
  const out = await runWithRetry(async () => { calls++; return ''; }, isEmpty, 2);
  assert.equal(out, '');
  assert.equal(calls, 2);
});

test('attempts=1 means no retry', async () => {
  const { runWithRetry } = await import(moduleUrl);
  let calls = 0;
  await assert.rejects(
    runWithRetry(async () => { calls++; throw new Error('boom'); }, isEmpty, 1),
    /boom/,
  );
  assert.equal(calls, 1);
});
